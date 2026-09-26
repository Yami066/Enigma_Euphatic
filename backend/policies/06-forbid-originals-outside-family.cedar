forbid (
  principal,
  action == Euphatics::Action::"DownloadOriginal",
  resource
) unless { resource.case.lead == principal || resource.case.heirs.contains(principal) };
