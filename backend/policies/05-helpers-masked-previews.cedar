permit (
  principal,
  action == Euphatics::Action::"ViewDocumentPreview",
  resource
) when { resource.case.helpers.contains(principal) };
