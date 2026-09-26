permit (
  principal,
  action in [Euphatics::Action::"ViewCase", Euphatics::Action::"UseAssistant"],
  resource
) when { resource.helpers.contains(principal) };
