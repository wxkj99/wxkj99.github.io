$ws = New-Object -ComObject WScript.Shell

$s = $ws.CreateShortcut('D:\math\NA\deploy_na.lnk')
$s.TargetPath = 'D:\blog\deploy_na.bat'
$s.Save()

$s2 = $ws.CreateShortcut('D:\math\NA\deploy_all.lnk')
$s2.TargetPath = 'D:\blog\deploy_all.bat'
$s2.Save()

$s3 = $ws.CreateShortcut('D:\programming\QR-viewer-simple\deploy_qr.lnk')
$s3.TargetPath = 'D:\blog\deploy_qr.bat'
$s3.Save()
