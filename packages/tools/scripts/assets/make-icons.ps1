Add-Type -AssemblyName System.Drawing
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../../')).Path
$outDir = Join-Path $repoRoot 'apps\extension\icons'
New-Item -ItemType Directory -Force $outDir | Out-Null

function New-RoundedPath([System.Drawing.RectangleF]$rect, [float]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $radius
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

foreach ($size in @(16, 32, 48, 128)) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $s = $size / 128.0
  $inset = [float](1 * $s)
  $rect = [System.Drawing.RectangleF]::new($inset, $inset, $size - 2 * $inset, $size - 2 * $inset)
  $radius = [float]([Math]::Max(2.5, 28 * $s))

  $bgPath = New-RoundedPath $rect $radius
  $gradRect = [System.Drawing.RectangleF]::new(0, 0, $size, $size)
  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($gradRect, [System.Drawing.Color]::FromArgb(255, 34, 48, 60), [System.Drawing.Color]::FromArgb(255, 10, 14, 18), 90)
  $g.FillPath($bgBrush, $bgPath)

  $rimPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 5, 204, 71), [float][Math]::Max(1, 2 * $s))
  $g.DrawPath($rimPen, $bgPath)

  $arrowRect = [System.Drawing.RectangleF]::new(0, 0, $size, $size)
  $arrowBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($arrowRect, [System.Drawing.Color]::FromArgb(255, 18, 224, 90), [System.Drawing.Color]::FromArgb(255, 4, 168, 58), 90)
  $stemPen = New-Object System.Drawing.Pen($arrowBrush, [float][Math]::Max(1.6, 15 * $s))
  $stemPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $stemPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  $cx = $size / 2.0
  $stemTop = 30 * $s
  $stemBottom = 76 * $s
  $g.DrawLine($stemPen, [float]$cx, [float]$stemTop, [float]$cx, [float]$stemBottom)

  $head = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new([float]$cx, [float](104 * $s)),
    [System.Drawing.PointF]::new([float](36 * $s), [float](62 * $s)),
    [System.Drawing.PointF]::new([float](92 * $s), [float](62 * $s))
  )
  $g.FillPolygon($arrowBrush, $head)

  $trayPen = New-Object System.Drawing.Pen($arrowBrush, [float][Math]::Max(1.6, 13 * $s))
  $trayPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $trayPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawLine($trayPen, [float](26 * $s), [float](112 * $s), [float](102 * $s), [float](112 * $s))

  if ($size -ge 32) {
    $sparkle = [System.Drawing.PointF[]]@(
      [System.Drawing.PointF]::new([float](99 * $s), [float](12 * $s)),
      [System.Drawing.PointF]::new([float](103.5 * $s), [float](21 * $s)),
      [System.Drawing.PointF]::new([float](112 * $s), [float](25 * $s)),
      [System.Drawing.PointF]::new([float](103.5 * $s), [float](29 * $s)),
      [System.Drawing.PointF]::new([float](99 * $s), [float](38 * $s)),
      [System.Drawing.PointF]::new([float](94.5 * $s), [float](29 * $s)),
      [System.Drawing.PointF]::new([float](86 * $s), [float](25 * $s)),
      [System.Drawing.PointF]::new([float](94.5 * $s), [float](21 * $s))
    )
    $sparkleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235, 235, 245, 255))
    $g.FillPolygon($sparkleBrush, $sparkle)
    $sparkleBrush.Dispose()
  }

  $bmp.Save((Join-Path $outDir "icon$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)

  $g.Dispose()
  $bmp.Dispose()
  $bgPath.Dispose()
  $bgBrush.Dispose()
  $arrowBrush.Dispose()
  $stemPen.Dispose()
  $trayPen.Dispose()
  $rimPen.Dispose()
}
Get-ChildItem $outDir | ForEach-Object { "$($_.Name) $($_.Length)" }
