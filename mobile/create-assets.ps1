Add-Type -AssemblyName System.Drawing

function Create-PlaceholderPNG {
    param(
        [string]$Path,
        [int]$Width,
        [int]$Height,
        [string]$BgColor = "#0f172a",
        [string]$FgColor = "#6366f1",
        [string]$Label = "OB"
    )

    $bmp = New-Object System.Drawing.Bitmap($Width, $Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    # Background
    $bg = [System.Drawing.ColorTranslator]::FromHtml($BgColor)
    $g.Clear($bg)

    # Accent circle in centre
    $fg = [System.Drawing.ColorTranslator]::FromHtml($FgColor)
    $pad = [int]($Width * 0.12)
    $solidBrush = New-Object System.Drawing.SolidBrush($fg)
    $g.FillEllipse($solidBrush, $pad, $pad, $Width - $pad*2, $Height - $pad*2)

    # Text
    if ($Label -and $Width -gt 16) {
        $fontSize = [Math]::Max(8, [int]($Width * 0.3))
        $font = New-Object System.Drawing.Font("Arial", $fontSize, [System.Drawing.FontStyle]::Bold)
        $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $sf = New-Object System.Drawing.StringFormat
        $sf.Alignment = [System.Drawing.StringAlignment]::Center
        $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
        $rect = New-Object System.Drawing.RectangleF(0, 0, $Width, $Height)
        $g.DrawString($Label, $font, $white, $rect, $sf)
        $font.Dispose()
        $white.Dispose()
    }

    $solidBrush.Dispose()
    $g.Dispose()

    $dir = Split-Path $Path
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created: $Path ($Width x $Height)"
}

$assetsDir = Join-Path $PSScriptRoot "assets"

Create-PlaceholderPNG -Path "$assetsDir\icon.png"              -Width 1024 -Height 1024 -Label "OB"
Create-PlaceholderPNG -Path "$assetsDir\adaptive-icon.png"     -Width 1024 -Height 1024 -Label "OB"
Create-PlaceholderPNG -Path "$assetsDir\splash.png"            -Width 1284 -Height 2778 -BgColor "#0f172a" -FgColor "#6366f1" -Label "OpenBot"
Create-PlaceholderPNG -Path "$assetsDir\favicon.png"           -Width 48   -Height 48   -Label ""
Create-PlaceholderPNG -Path "$assetsDir\notification-icon.png" -Width 96   -Height 96   -Label "OB"

Write-Host "`nAll assets generated successfully."
