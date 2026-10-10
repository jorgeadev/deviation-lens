$ErrorActionPreference = 'Continue'
$toolsDir = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$dir = Join-Path $toolsDir 'out'
New-Item -ItemType Directory -Force $dir | Out-Null
$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

$h = (Invoke-WebRequest -Uri "https://www.deviantart.com/dutteart/art/Forest-Hobbit-Home-1383355420" -UserAgent $ua).Content -replace '\\/','/'
$fullview = [regex]::Match($h, 'https://images-wixmp-[^\s"''<>\\]+forest_hobbit_home_by_dutteart_dmvm3vg-fullview\.jpg\?token=[^\s"''<>\\]+').Value
if (-not $fullview) { $fullview = [regex]::Match($h, 'https://images-wixmp-[^\s"''<>\\]+dmvm3vg-fullview[^\s"''<>\\]*\?token=[^\s"''<>\\]+').Value }
"token url found: $([bool]$fullview)"
$u = [Uri]$fullview
$tok = $u.Query
$base = $u.GetLeftPart([UriPartial]::Authority) + "/f/dc204950-804c-4f71-831b-e68eb3c4cab6/dmvm3vg-03d949cd-3248-41e3-a658-4143c1ec92de.png"

$tests = [ordered]@{
  'A_jpg_q100_caps'      = "$base/v1/fill/w_1280,h_717,q_100,strp/forest_hobbit_home_by_dutteart_dmvm3vg-fullview.jpg$tok"
  'B_png_q100_caps'      = "$base/v1/fill/w_1280,h_717,q_100,strp/forest_hobbit_home_by_dutteart_dmvm3vg-fullview.png$tok"
  'C_png_foo_name'       = "$base/v1/fill/w_1280,h_717,q_100,strp/foo.png$tok"
  'D_fit_q100_foo'       = "$base/v1/fit/w_1280,h_717,q_100,strp/foo.jpg$tok"
  'E_nostrp'             = "$base/v1/fill/w_1280,h_717,q_100/foo.jpg$tok"
  'F_noq'                = "$base/v1/fit/w_1280,h_717/foo.jpg$tok"
  'G_origfmt_png'        = "$base/v1/fill/w_1280,h_717,q_100,strp/forest_hobbit_home_by_dutteart_dmvm3vg.png$tok"
  'H_q95'                = "$base/v1/fill/w_1280,h_717,q_95,strp/foo.jpg$tok"
  'I_w1279'              = "$base/v1/fill/w_1279,h_717,q_100,strp/foo.jpg$tok"
  'J_fit_w1280_only'     = "$base/v1/fit/w_1280,q_100,strp/foo.jpg$tok"
}
$out = @()
foreach ($k in $tests.Keys) {
  $t = $tests[$k]
  try {
    $r = Invoke-WebRequest -Uri $t -Method Head -UserAgent $ua -TimeoutSec 30
    $len = $r.Headers['Content-Length']; if ($len -is [array]) { $len = $len[0] }
    $ct = $r.Headers['Content-Type']; if ($ct -is [array]) { $ct = $ct[0] }
    $line = "[$k] STATUS=$($r.StatusCode) LEN=$len TYPE=$ct"
  } catch {
    $code = ''
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    $line = "[$k] ERROR=$code"
  }
  $out += $line
  $line
}
$out | Set-Content (Join-Path $dir 'probe3_result.txt')

$dl = $dir
New-Item -ItemType Directory -Force $dl | Out-Null
foreach ($k in @('A_jpg_q100_caps','B_png_q100_caps','C_png_foo_name','D_fit_q100_foo')) {
  try {
    Invoke-WebRequest -Uri $tests[$k] -UserAgent $ua -OutFile (Join-Path $dl "$k.bin") -TimeoutSec 60
    $f = Join-Path $dl "$k.bin"
    Add-Type -AssemblyName System.Drawing
    $img = [System.Drawing.Image]::FromFile($f)
    "[$k] downloaded bytes=$((Get-Item $f).Length) dims=$($img.Width)x$($img.Height) fmt=$($img.RawFormat.Guid)"
    $img.Dispose()
  } catch { "[$k] DL-ERROR $($_.Exception.Message)" }
}
