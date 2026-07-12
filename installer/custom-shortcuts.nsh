!macro customInstall
  Delete "$DESKTOP\稳如狗生图工作台V1.0.lnk"
  Delete "$SMPROGRAMS\稳如狗生图工作台V1.0.lnk"
  Delete "$DESKTOP\刘辉生图.lnk"
  Delete "$SMPROGRAMS\刘辉生图.lnk"

  CreateShortCut "$DESKTOP\刘辉生图.lnk" "$INSTDIR\刘辉生图软件工作台.exe" "" "$INSTDIR\resources\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\刘辉生图.lnk" "$INSTDIR\刘辉生图软件工作台.exe" "" "$INSTDIR\resources\icon.ico" 0

  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  Delete "$DESKTOP\稳如狗生图工作台V1.0.lnk"
  Delete "$SMPROGRAMS\稳如狗生图工作台V1.0.lnk"
  Delete "$DESKTOP\刘辉生图.lnk"
  Delete "$SMPROGRAMS\刘辉生图.lnk"
!macroend
