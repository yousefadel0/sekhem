import assert from "node:assert/strict"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { ApprovalActions } from "../components/workspace/approval-actions"

function controls(disabled = false) {
  // Mock the React dispatcher so useState works when called directly.
  (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = {
    useState: (initialValue: any) => [initialValue, () => {}],
  };
  const calls: string[] = []
  const element = ApprovalActions({ disabled, onApprove: () => { calls.push("approve") }, onReject: () => { calls.push("reject") }, onSkip: () => { calls.push("skip") }, onCancel: () => { calls.push("cancel") } })
  const choicesDiv = React.Children.toArray(element.props.children).find((c: any) => c && c.props && c.props.className === "approval-choices") as React.ReactElement<any>
  const buttons = React.Children.toArray(choicesDiv.props.children).filter((child): child is React.ReactElement<any> => React.isValidElement(child) && child.type === "button")
  return { calls, buttons, element }
}

test("only the explicit Allow once approves; Reject, Skip and Cancel invoke distinct handlers", async () => {
  const c = controls()
  assert.equal(c.buttons.length, 4)
  assert.deepEqual(c.calls, [])
  await c.buttons[1].props.onClick() // Reject
  await c.buttons[2].props.onClick() // Skip
  await c.buttons[3].props.onClick() // Cancel
  assert.deepEqual(c.calls, ["reject", "skip", "cancel"])
  await c.buttons[0].props.onClick() // Allow once -> onApprove
  assert.deepEqual(c.calls, ["reject", "skip", "cancel", "approve"])
})

test("disabled review controls cannot trigger decisions or cancellation", async () => {
  const c = controls(true)
  for (const b of c.buttons) { assert.equal(b.props.disabled, true); await b.props.onClick() }
  assert.deepEqual(c.calls, [])
})

test("review explains dependency cancellation and does not promise rollback", () => {
  const html = renderToStaticMarkup(controls().element)
  assert.match(html, /Only “Allow once” authorizes this reviewed action/)
  assert.match(html, /Replies in Chat never approve it/)
})
