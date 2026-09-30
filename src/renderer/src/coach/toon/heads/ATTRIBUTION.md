# Caricature photo credits

Bibi and The Donald's caricatures use six photos from Wikimedia Commons.

- **Bibi** uses three photos.
- **The Donald** uses four. His Oval Office head comes from the same photo as one of Bibi's.

## Bibi

| Files here | Source | Photographer / provider | Licence |
|---|---|---|---|
| `bibi-whitehouse-2026-07-28-head.webp`, `-jaw.webp` | [President Donald J. Trump meets with Israeli Prime Minister Benjamin Netanyahu (55429150214).jpg](https://commons.wikimedia.org/wiki/File:President_Donald_J._Trump_meets_with_Israeli_Prime_Minister_Benjamin_Netanyahu_(55429150214).jpg). Oval Office, 28 July 2026, White House photo ID P20260728DT-0725. | Official White House Photo by Daniel Torok | Public domain: a work of the U.S. federal government (17 U.S.C. § 105) |
| `bibi-dod-2025-02-05-head.webp`, `-jaw.webp` | [Israeli Prime Minister Benjamin Netanyahu at the Pentagon, USA on February 5, 2025 (cropped).jpg](https://commons.wikimedia.org/wiki/File:Israeli_Prime_Minister_Benjamin_Netanyahu_at_the_Pentagon,_USA_on_February_5,_2025_(cropped).jpg), from [DoD Flickr 54309244286](https://www.flickr.com/photos/68842444@N03/54309244286/) | DoD photo by U.S. Air Force Senior Airman Madelyn Keech | Public domain: a work of the U.S. federal government. The appearance of U.S. Department of Defense (DoD) visual information does not imply or constitute DoD endorsement. |
| `bibi-pib-2026-02-26-head.webp`, `-jaw.webp` | [Israeli Prime Minister Benjamin Netanyahu 20260226.jpg](https://commons.wikimedia.org/wiki/File:Israeli_Prime_Minister_Benjamin_Netanyahu_20260226.jpg), 26 February 2026 | Prime Minister's Office, Government of India; published by the Press Information Bureau, Government of India | [Government Open Data License – India (GODL-India)](https://data.gov.in/sites/default/files/Gazette_Notification_OGDL.pdf); attribution required |

## The Donald

| Files here | Source | Photographer / provider | Licence |
|---|---|---|---|
| `trump-portrait-2017-head.webp`, `-jaw.webp` | [Donald Trump official portrait.jpg](https://commons.wikimedia.org/wiki/File:Donald_Trump_official_portrait.jpg). The White House, 6 October 2017. | Official White House Photo by Shealah Craighead | Public domain: a work of the U.S. federal government (17 U.S.C. § 105) |
| `trump-portrait-2025-head.webp`, `-jaw.webp` | [Official Presidential Portrait of President Donald J. Trump (2025).jpg](https://commons.wikimedia.org/wiki/File:Official_Presidential_Portrait_of_President_Donald_J._Trump_(2025).jpg) | Daniel Torok, The White House | Public domain: a work of the U.S. federal government |
| `trump-whitehouse-2026-07-28-head.webp`, `-jaw.webp` | [President Donald J. Trump meets with Israeli Prime Minister Benjamin Netanyahu (55429150214).jpg](https://commons.wikimedia.org/wiki/File:President_Donald_J._Trump_meets_with_Israeli_Prime_Minister_Benjamin_Netanyahu_(55429150214).jpg). Oval Office, 28 July 2026, White House photo ID P20260728DT-0725 (the same photo as Bibi's Oval Office head). | Official White House Photo by Daniel Torok | Public domain: a work of the U.S. federal government |
| `trump-portrait-2026-06-head.webp`, `-jaw.webp` | [June 2026 Official Portrait of Donald J. Trump (cropped).jpg](https://commons.wikimedia.org/wiki/File:June_2026_Official_Portrait_of_Donald_J._Trump_(cropped).jpg), 1 June 2026 | Daniel Torok, The White House | Public domain: a work of the U.S. federal government |

## What was changed

[`scripts/toon-cutout.swift`](../../../../../../scripts/toon-cutout.swift) made every file from its photo, the same way each time:

- **Cropped** to the head alone. Anyone else in the photo, the background, and everything below the jaw are removed: no collar, tie, lapel pin or flag. Scraps of mask not joined to the face are dropped, and wispy edges take the head's own colour rather than the background's. For the Oval Office head of The Donald, the edge is pulled in a little further (`trim` 0.025), so the gilded mantel behind him doesn't show through his hair.
- **Colour** raised slightly: saturation +8 %, contrast +5 %.
- **Outline:** a white sticker outline added round the head.
- **Mouth:** a dark mouth painted just under the lips, and the jaw cut out as its own layer. Together they let the app open and close the jaw as the coach talks.
- **Size and format:** scaled to 288 × 288 px and saved as WebP.

Nothing else was changed: no features were exaggerated or redrawn. The caricature comes only from the head's size on a small cartoon body, and from how it moves.
