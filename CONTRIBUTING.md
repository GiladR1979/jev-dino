# Contributing

Use Node 22.16+ and run `npm ci`, then `npm run check`. Tests require no credentials or external API calls.

Keep upstream Chromium files byte-for-byte unchanged. Put integration changes in the host modules. A source-version update must replace the manifest and independently verify every upstream file.

For changes to request lifecycle, validation, or storage, include a focused offline regression test. For recording changes, describe the desktop Chrome validation performed and keep historical benchmark claims separate from new runs. Format authored files with `npm run format`.

Never commit `.env`, keys, local recordings, or raw run evidence. Keep large public videos in releases so a normal clone remains small.
