import { describe, expect, it } from "vitest";

import {
  allPermissions,
  hasPermission,
  Permission,
  permissionsFromList,
} from "./permissions";

describe("permissions", () => {
  it("uses the SDK's bits", () => {
    expect(Permission).toEqual({ Initiate: 1, Vote: 2, Execute: 4 });
    expect(allPermissions()).toEqual({ mask: 7 });
  });

  it("builds and reads masks", () => {
    const voter = permissionsFromList([Permission.Vote, Permission.Execute]);
    expect(voter).toEqual({ mask: 6 });
    expect(hasPermission(voter, Permission.Vote)).toBe(true);
    expect(hasPermission(voter, Permission.Execute)).toBe(true);
    expect(hasPermission(voter, Permission.Initiate)).toBe(false);
    expect(hasPermission(permissionsFromList([]), Permission.Vote)).toBe(false);
  });
});
