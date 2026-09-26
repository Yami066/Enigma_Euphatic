permit (
  principal,
  action in [Euphatics::Action::"ViewCase", Euphatics::Action::"EditCase", Euphatics::Action::"ManageMembers", Euphatics::Action::"UploadDocument", Euphatics::Action::"UseAssistant"],
  resource
) when { resource.lead == principal };
