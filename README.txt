            +-----------+
            |Data Source|
            +--^--+-----+
               |  |
+-------+    +-+--v--+    +-------+
|Trigger+---->Fetcher+---->Storage|
+-------+    +-------+    +-^--+--+
                            |  |
                         +--+--v--+
                         |Showcase|
                         +----+---+
                              |
                         +----+------+
                         | User view |
                         +-----------+

----------------------------------------------------------------------

                  +-----------+
                  |Data Source|
                  +--^--+-----+
                     |  |
                 +-----------------------------+
                 |   |  |       Git Repository |
+----------------------------+                 |
| +-----------+  |   |  |    |                 |
| |on:        |  | +-+--v--+ | +-----------+   |
| |  schedule:+---->main.py+--->.json,.csv |   |
| |  - cron   |  | +-------+ | +----+------+   |
| +--+--------+  |           |      |          |
|                |           | +------------+  |
| GitHub Actions |           | | .html,.js  |  |
+----------------------------+ +----+-------+  |
                 |                  |          |
                 +-----------------------------+
                                    |
                                +---v----------+
                                | GitHub Pages |
                                +--------------+
                                
## Static site

The repository now includes a Vite + TypeScript + ECharts static site in
`site/`. GitHub Actions builds the site and publishes it to GitHub Pages after
each scheduled data collection run:

Target Pages URLs after Pages is enabled:

* overview: https://doradx.github.io/LongRiver/
* station detail: https://doradx.github.io/LongRiver/station/?id=60112200
* data notes: https://doradx.github.io/LongRiver/about/

The browser bundle is generated from the monthly `LongRiver.json` snapshots.
It keeps the latest year of observations in per-station JSON files, while the
raw CSV/JSON archive remains the repository's source data.

To build locally, run `npm install` and `npm run build` from `site/`, then run
`python site/scripts/build_site_data.py --output .codex/outputs/pages/data`
from the repository root.

Read https://xirtam.cxumol.com/long-river-station-data-get-plot/ for technical description in Chinese.
         
