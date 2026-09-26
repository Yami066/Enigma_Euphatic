forbid (
  principal,
  action == Euphatics::Action::"ManageMembers",
  resource
) unless { resource.lead == principal };
