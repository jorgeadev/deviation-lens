# Chrome Web Store graphics

The current store images are in [`apps/web/assets/0.2.0/store/`](../../../web/assets/0.2.0/store/). All are JPEG with no alpha channel, as the store requires.

| Dashboard field | File | Size |
| --- | --- | --- |
| Screenshots (up to 5) | `screenshots/1-download-your-picks.jpg` to `screenshots/5-choose-location.jpg` | 1280 x 800 |
| Small promo tile | `promo-small-440x280.jpg` | 440 x 280 |
| Marquee promo tile | `promo-marquee-1400x560.jpg` | 1400 x 560 |

`pnpm shots` builds them for the current version, along with the matching website images, and packs them into `dist/store/deviation-lens-<version>-store-images.zip`. The panels are captures of the real extension UI, filled with sample data and the project's own illustrations from `packages/tools/scripts/assets/sample-art/`, so no third-party artwork appears in them.

This folder keeps the listing icon and earlier artwork:

- `store-icon-128.png`: 128 x 128 listing icon with transparent padding.
- `promo-small.png`: earlier 440 x 280 small promo tile.
- `promo-marquee.png`: earlier 1400 x 560 marquee promo tile.
