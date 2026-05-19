!macro customInstall
  Delete "$DESKTOP\稳如狗生图工作台V1.0.lnk"
  Delete "$SMPROGRAMS\稳如狗生图工作台V1.0.lnk"

  CreateShortCut "$DESKTOP\稳如狗生图工作台V1.0.lnk" "$INSTDIR\稳如狗生图工作台V1.0.exe" "" "$INSTDIR\resources\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\稳如狗生图工作台V1.0.lnk" "$INSTDIR\稳如狗生图工作台V1.0.exe" "" "$INSTDIR\resources\icon.ico" 0

  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  Delete "$DESKTOP\稳如狗生图工作台V1.0.lnk"
  Delete "$SMPROGRAMS\稳如狗生图工作台V1.0.lnk"
!macroend
