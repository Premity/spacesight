import torch
import torch.nn as nn

class InceptionBlock(nn.Module):
    """
    One InceptionTime-style module with four parallel branches and a residual shortcut.

    Parameters
    ----------
    in_channels     : Number of input channels.
    nb_filters      : Number of filters per branch. Output channels = nb_filters * 4.
    bottleneck_size : Width of the 1x1 bottleneck applied before the parallel convs.
    """
    def __init__(self, in_channels: int, nb_filters: int = 32, bottleneck_size: int = 32):
        super().__init__()

        self.bottleneck = nn.Conv1d(
            in_channels, bottleneck_size, kernel_size=1, bias=False
        )

        # Three parallel convolutions on the bottleneck output
        self.conv_k3  = nn.Conv1d(bottleneck_size, nb_filters, kernel_size=3,  padding=1,  bias=False)
        self.conv_k7  = nn.Conv1d(bottleneck_size, nb_filters, kernel_size=7,  padding=3,  bias=False)
        self.conv_k15 = nn.Conv1d(bottleneck_size, nb_filters, kernel_size=15, padding=7,  bias=False)

        # MaxPool branch - operates on raw input before bottleneck
        self.maxpool = nn.MaxPool1d(kernel_size=3, stride=1, padding=1)
        self.conv_mp = nn.Conv1d(in_channels, nb_filters, kernel_size=1, bias=False)

        # Post-concat normalisation + activation
        out_channels = nb_filters * 4
        self.bn  = nn.BatchNorm1d(out_channels)
        self.act = nn.GELU()

        # Residual shortcut: project if channel count changes, else plain BN
        if in_channels == out_channels:
            self.shortcut = nn.Identity()
        else:
            self.shortcut = nn.Sequential(
                nn.Conv1d(in_channels, out_channels, kernel_size=1, bias=False),
                nn.BatchNorm1d(out_channels)
            )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        residual = self.shortcut(x)

        b_out = self.bottleneck(x)

        b1 = self.conv_k3(b_out)
        b2 = self.conv_k7(b_out)
        b3 = self.conv_k15(b_out)
        b4 = self.conv_mp(self.maxpool(x))

        out = torch.cat([b1, b2, b3, b4], dim=1)   # (B, nb_filters*4, T)
        out = self.bn(out)
        out = self.act(out + residual)
        return out


class SEBlock(nn.Module):
    """
    Squeeze-and-Excitation channel attention block.

    Parameters
    ----------
    channels  : Number of input (and output) channels.
    reduction : Bottleneck reduction ratio for the excitation MLP.
    """
    def __init__(self, channels: int, reduction: int = 16):
        super().__init__()
        assert channels % reduction == 0, \
            f"channels ({channels}) must be divisible by reduction ({reduction})"

        self.squeeze    = nn.AdaptiveAvgPool1d(1)
        self.excitation = nn.Sequential(
            nn.Linear(channels, channels // reduction, bias=False),
            nn.ReLU(inplace=True),
            nn.Linear(channels // reduction, channels, bias=False),
            nn.Sigmoid()
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        b, c, _ = x.shape
        s = self.squeeze(x).view(b, c)           # (B, C)
        e = self.excitation(s).view(b, c, 1)     # (B, C, 1)
        return x * e                             # broadcast over T


class InceptionResNet1D(nn.Module):
    """
    InceptionTime-style 1D ResNet for binary transit classification.

    Parameters
    ----------
    in_channels : Number of input channels. 1 = local transit view only.
                  Set to 2 after secondary eclipse preprocessing to add that view.
    nb_filters  : Base filter count per Inception branch. Output of each block
                  is nb_filters * 4. First two blocks use nb_filters, last two
                  use nb_filters * 2 for a progressive channel widening.
    dropout     : Dropout probability applied before the classification head.
    """
    def __init__(self, in_channels: int = 1, nb_filters: int = 32, dropout: float = 0.3):
        super().__init__()

        # -- Stem --------------------------------------------------------------
        self.stem = nn.Sequential(
            nn.Conv1d(in_channels, 32, kernel_size=7, padding=3, bias=False),
            nn.BatchNorm1d(32),
            nn.GELU(),
            nn.MaxPool1d(kernel_size=2, stride=2),   # (B, 32, 100)
        )

        # -- Stage 1 -----------------------------------------------------------
        self.inc1  = InceptionBlock(32,  nb_filters=nb_filters)        # -> (B, 128, 100)
        self.inc2  = InceptionBlock(128, nb_filters=nb_filters)        # -> (B, 128, 100)
        self.pool1 = nn.MaxPool1d(kernel_size=2, stride=2)             # -> (B, 128,  50)

        # -- Stage 2 -----------------------------------------------------------
        self.inc3  = InceptionBlock(128, nb_filters=nb_filters)        # -> (B, 128,  50)
        self.inc4  = InceptionBlock(128, nb_filters=nb_filters * 2)    # -> (B, 256,  50)
        self.pool2 = nn.MaxPool1d(kernel_size=2, stride=2)             # -> (B, 256,  25)

        # -- Attention + Pooling -----------------------------------------------
        self.se  = SEBlock(nb_filters * 8, reduction=16)               # nb_filters*2*4=256
        self.gap = nn.AdaptiveAvgPool1d(1)                             # -> (B, 256)

        # -- Classification head -----------------------------------------------
        head_in = nb_filters * 8    # 256
        self.head = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(head_in, 64),
            nn.GELU(),
            nn.Linear(64, 1),
        )

        self._init_weights()

    def _init_weights(self):
        """
        Weight initialisation calibrated for GELU activations.
        """
        gelu_gain = 1.702  # empirically established for smooth activations
        for m in self.modules():
            if isinstance(m, nn.Conv1d):
                # Kaiming with explicit GELU-appropriate gain
                nn.init.kaiming_normal_(m.weight, mode='fan_out',
                                        nonlinearity='relu')
                # Scale up by the gain ratio: gelu_gain / relu_gain
                with torch.no_grad():
                    m.weight.mul_(gelu_gain / (2.0 ** 0.5))
            elif isinstance(m, nn.Linear):
                nn.init.xavier_uniform_(m.weight,
                                        gain=nn.init.calculate_gain('sigmoid'))
                if m.bias is not None:
                    nn.init.zeros_(m.bias)
            elif isinstance(m, nn.BatchNorm1d):
                nn.init.ones_(m.weight)
                nn.init.zeros_(m.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, in_channels, 201)
        x = self.stem(x)    # (B, 32,  100)
        x = self.inc1(x)    # (B, 128, 100)
        x = self.inc2(x)    # (B, 128, 100)
        x = self.pool1(x)   # (B, 128,  50)
        x = self.inc3(x)    # (B, 128,  50)
        x = self.inc4(x)    # (B, 256,  50)
        x = self.pool2(x)   # (B, 256,  25)
        x = self.se(x)      # (B, 256,  25)
        x = self.gap(x)     # (B, 256,   1)
        x = x.squeeze(-1)   # (B, 256)
        x = self.head(x)    # (B, 1)
        return x.squeeze(-1)  # (B,)  - raw logit