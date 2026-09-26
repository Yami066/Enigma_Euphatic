permit (
  principal,
  action in [Euphatics::Action::"ViewDocumentPreview", Euphatics::Action::"DownloadOriginal"],
  resource
) when { resource.case.lead == principal || resource.case.heirs.contains(principal) };
