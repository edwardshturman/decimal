import { describe, expect, test } from "bun:test"
import {
  chooseNextKeyVersion,
  findRetirableVersions
} from "@/scripts/rotate-access-token-key"

describe("chooseNextKeyVersion", () => {
  test("increments a numeric version", () => {
    expect(chooseNextKeyVersion("1", ["1"])).toBe("2")
    expect(chooseNextKeyVersion("9", [])).toBe("10")
  })

  test("uses the requested version", () => {
    expect(chooseNextKeyVersion("v1", [], "v2")).toBe("v2")
  })

  test("needs a requested version when the current isn't numeric", () => {
    expect(() => chooseNextKeyVersion("v1", [])).toThrow("--version")
  })

  test("refuses a version that's been used", () => {
    expect(() => chooseNextKeyVersion("1", ["2"])).toThrow("already been used")
    expect(() => chooseNextKeyVersion("1", [], "1")).toThrow(
      "already been used"
    )
  })
})

describe("findRetirableVersions", () => {
  test("retires only versions no database has Items on", () => {
    expect(
      findRetirableVersions(
        ["1", "2", "3"],
        [
          { "2": 4, "4": 10 },
          { "3": 1, "4": 2 }
        ]
      )
    ).toEqual(["1"])
  })

  test("treats a zero count as no Items", () => {
    expect(findRetirableVersions(["1"], [{ "1": 0 }])).toEqual(["1"])
  })
})
