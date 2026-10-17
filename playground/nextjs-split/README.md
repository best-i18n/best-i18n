# best-i18n Next.js split-catalog playground

The Next.js setup from [`playground/nextjs`](../nextjs#readme), laid out like a
larger app - feature folders under `src/features` - with the catalog **split
into shards by source directory** instead of one `.po` per locale.

```bash
pnpm --filter best-i18n build     # the playground consumes the built package
pnpm play nextjs-split            # http://localhost:3000 and /zh
pnpm play nextjs-split extract    # re-shard after editing a message
```

## The split

`i18n.config.ts` sets `split: { depth: 2 }`, so a file's messages go to its
directory two levels below `src`, and `i18n-extract` writes:

```text
messages/                     # "Billing", "Settings": header and page share them
  app/                        # app/[locale]/page.tsx
  app/[locale]/billing/       # the billing page's own text
  app/[locale]/settings/
  components/                 # the site header
  features/                   # "Save": both features use it
  features/billing/
  features/settings/
```

Each directory holds its own `messages.pot` and `zh.po`.

- **Route segments do not count.** `[locale]` would otherwise spend a level
  and put the whole app in one shard. A shard path never ends on one either,
  which is why `app/[locale]/page.tsx` lands in `app`.
- **Shared texts rise.** A message used from several shards lives once, in
  the deepest directory they share: "Save", on the billing plan card and the
  profile form, goes to `features`; "Billing" and "Settings", in the header
  and on their pages, have nothing in common below `src` and go to the root.
- **Nothing else knows about it.** The Next plugin reads every shard under
  `messages/`; the split is a property of the files, not of the build.

Try moving a component between `features/billing` and `features/settings`
and running `extract`: its messages move shard and keep their translations.
Remove `split` from the config and run it again, and the shards fold back into
one `messages/zh.po`.
