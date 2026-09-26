permit (
  principal,
  action in [Euphatics::Action::"ViewCase", Euphatics::Action::"EditCase", Euphatics::Action::"UploadDocument", Euphatics::Action::"UseAssistant"],
  resource
) when { resource.heirs.contains(principal) };
