# Results block: Tally

Route: `/spl-token-tools/reclaim-rent/demo-2-reward`. Press R to replay the
scan and M to turn motion off. The dropdown switches between the wallet
states a final design has to handle. Ticking accounts in the tables below
changes the block live.

Two directions were built: Tally (from Stage) and Deposit (from Card). The
owner picked Tally, and Deposit was removed.

## What the promo does, measured

I extracted promo.mp4 frame by frame and measured element sizes at 30 fps
rather than going by the stills.

- **Pop.** A pill starts near 0.6 scale, passes full size at ~110 ms, peaks
  6% over at ~200 ms and rests by ~330 ms, with no visible undershoot. That's
  a spring with a damping ratio near 0.5 (stiffness 380, damping 20). Every
  pop uses it (`POP` in `_parts/look.ts`).
- **Counter.** It runs +0.0000 to +0.0661 in 1.33 s, slow, then fast, then
  slow, because it follows coins. Each account dot gets a ring and sends a
  small green dot into the number. Tally counts this way, faster.
- **Ring.** The closing logo sends out a ring that thins as it grows. The
  CTA then pulses ±3% on a loop; I left that out because it never settles.
- **Colour.** The promo's pill is #e22325, the site's own `--color-primary`
  (#e22424), not #d6392f. Ink is slate-800, the money green is emerald-600,
  chips are emerald-100 on emerald-800, and the dots are Tailwind 400s. The
  values in `demo/_variants/promo.css.ts` were eyeballed from compressed
  stills. Using the brand red means the block matches the header instead of
  adding a third red.

## Tally

**Idea.** The promo's "Reclaim the excess" scene, made literal. Every account
is a coin, and the total is counted from the coins.

**Layout.** It keeps the layout the owner liked in every round: amount on the
left, pill on the right. Under the amount sits a row of coins, one per
account with excess. Ticked coins are in colour, unticked ones are hollow,
and mints are square. Above 60 accounts the row stops at 60 and adds "+N".
The row is a live summary of the tables below: untick a row and its coin
deflates while the number springs down; tick it and it tosses a coin into
the number.

**Arrival (ms).**

| Time        | What happens                                                              |
| ----------- | ------------------------------------------------------------------------- |
| 0           | Headline words pop, 40 ms apart                                           |
| 80          | The pill pops, and works from its first frame                             |
| 120         | The amount appears at +0.00000                                            |
| ~130 to 370 | Coins pop in a wave, each tossing a green coin into the number            |
| 280 to 640  | The number counts, timed so each coin lands as the number takes its share |
| 640         | The number thumps and the pill sends out the promo's ring                 |
| ~960        | Everything has settled                                                    |

**Why.** It's playful, and the reward is literal: you watch your accounts
pay into the total. The coins carry information, so they earn their place.
It keeps amount-left, button-right.

## Reclaiming, and the payoff

The pill sends straight from the block, with no review dialog; that stays
behind a separate button in the detailed view (not built yet). Progress
shows in the block for any number of transactions. The demo fakes the
wallet and the chain: switch "How the reclaim goes" and "Wallet" in the bar.

**The wait.** The pill reads "Check your wallet" (or "Check your wallet, 2
of 6" when the wallet asks once per transaction), then "Reclaiming…" or
"Reclaiming, 3 of 6". While a transaction confirms, its coins breathe in a
slow wave. Confirming takes 2 to 3 s; nothing pretends to know progress
within one transaction.

**Coins fill from the left.** Transactions land in any order, but the coin
row shows progress, not which account went in which transaction: as each
one lands, the next stretch of coins from the left turns over to green
checks, whichever transaction it was. When several land close together
their coins join one sweep rather than starting waves of their own. The
number of green coins stays true; only the order is tidied. The tables
below still show each account's real state.

**The payoff (ms, from the last confirmation).**

| Time         | What happens                                                                              |
| ------------ | ----------------------------------------------------------------------------------------- |
| 0 to ~450    | The sweep turns the last coins over (longer if several transactions just landed)          |
| 0            | The red pill becomes a green "✓ Reclaimed" badge, with a green ring                       |
| 80           | Promo-coloured dots burst from the badge's edge                                           |
| 0 to ~450    | "Get your SOL back." rearranges into "Your SOL is back." ("Get" drops away, "is" pops in) |
| 300          | The number thumps                                                                         |
| 450 to ~1150 | Once every coin is green, a hop ripples through them                                      |

After a retry that finishes the job, the number also counts up from what was
left to the full amount.

**When it doesn't work, no payoff.**

- A transaction fails: the green run stops where the reclaimed accounts end
  and the untouched ones keep their colours at the end of the row, the number springs to what's left, and the pill says "Try
  again" under a red line that says how many didn't go through.
- The wallet says no: the pill shakes, and the block says "Cancelled in your
  wallet. Nothing was sent."

**For the real page.** The demo's `useFakeReclaim` has the same shape as
`useReclaimExcess`: "signing" until the wallet returns, "confirming" per
batch after sending, and a confirmed or failed result per batch. A wallet
that asks once and is turned down throws before anything is sent, which is
the "Cancelled" case. A wallet that asks per transaction reports a refusal
as that batch failing, so it lands in "Try again". While a reclaim is in
flight the tables must not change the selection.

## Guarantees

- **Short.** The arrival lands by ~0.65 s and settles before 1 s. The
  payoff settles in about 1.15 s, the last part being the hop. Nothing loops
  except the coins breathing while the chain confirms.
- **The button is never held back.** It shows within 80 ms and is clickable
  from its first frame. Nothing disables it until the animation is done.
- **Reduced motion turns everything off.** Nothing moves, no coins fly or
  breathe, the amount shows its final value and the tables appear in place.
  A reclaim still shows its progress in words and its coins still turn
  green; they just don't animate. M simulates it in the demo.
- **Background tabs.** If the scan finishes while the tab is in the
  background, the arrival pauses and finishes when the tab comes back.
  Nothing is left half-drawn.
- **States.** Nothing selected (disabled pill, hollow coins), only mints,
  only token accounts, 120 accounts in 6 transactions (coins shrink past 60
  and stop at 120, then "+N"), fees larger than the excess ("Not enough to reclaim yet."), nothing
  to reclaim (an outline "Check again" pill), and after a reclaim ("Your SOL
  is back." with the green badge and every coin checked).

## Why Motion

The amount is a MotionValue that writes its text straight to the DOM, so the
count never re-renders React. When the selection changes it retargets with a
spring from wherever it is, even mid-count. CSS can't animate text, and a
hand-rolled requestAnimationFrame tween restarts abruptly when retargeted.
Motion also gives the measured spring, `stagger`, and the coin flights.

The cost is about 21 kB gzipped for the parts used here: `animate`, a few
hooks, `stagger` and `cubicBezier`. The demo avoids the `motion` component,
which would double that. If you'd rather not add the dependency, the arrival
ports to CSS `linear()` springs plus the Web Animations API, and the count
to about 40 lines of requestAnimationFrame. You would lose the mid-count
retarget.

## Still open

If the promo's red stays, the review dialog's indigo button should follow.
