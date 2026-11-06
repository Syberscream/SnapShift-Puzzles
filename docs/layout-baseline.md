Snapshift Master Layout Baseline
================================

Source of truth
---------------
Baseline taken from the current category page.
Use this file as the visual/layout standard for:
- index.html
- daily-archive.html
- about.html
- contact.html
- shop.html
- how-scoring-works.html
- swap-hint-guide.html

Game page can keep its custom gameplay layout, but the outer shell/header/footer
should still follow this baseline where practical.

1) Page structure
-----------------
Use this exact page wrapper everywhere:

<body>
  <div class="screen">
    <div class="shell">
      <!-- header -->
      <!-- content -->
      <!-- footer -->
    </div>
  </div>
</body>

2) Page width and positioning
-----------------------------
Use:
- .screen: position: relative; z-index: 1; min-height: 100vh;
- .shell:
    width: min(1200px, 100%);
    margin: 0 auto;
    padding: 18px;
    box-sizing: border-box;

Do NOT:
- add extra .screen padding on some pages
- use 1080px shells on some pages and 1200px on others
- add page-specific left/right offset hacks
- add scrollbar-gutter/layout compensation unless used site-wide

3) Body and background
----------------------
Use:
- body background: #000000
- margin: 0
- overflow: auto
- -webkit-overflow-scrolling: touch
- position: relative
- font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif

Theme overlays/background art should remain optional and controlled by theme/admin,
not hard-coded page by page.

4) Header baseline
------------------
Use this exact structure:

<header class="topbar">
  <div class="brand">
    <img class="logoImg" src="Snapshift_Puzzles_Logo.png" onerror="this.onerror=null;this.src='PuzzleQuest_Logo.png'" alt="Snapshift Puzzles" />
  </div>

  <div class="right">
    <!-- page-specific controls -->
  </div>
</header>

Use:
- .topbar:
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 6px 14px;
    flex-wrap: wrap;

- .brand:
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 240px;

- .right:
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;

- .logoImg:
    height: 75px;
    width: auto;
    max-width: 750px;
    object-fit: contain;
    image-rendering: auto;

5) Header buttons baseline
--------------------------
Primary header button styles should come from the category page.

Use:
- .pill
- .btnSoft

.pill:
- inline-flex
- gap: 8px
- padding: 7px 10px
- border-radius: 999px
- border: 1px solid rgba(42,57,82,.7)
- background: rgba(0,0,0,.18)
- font-weight: 800
- font-size: 12px
- white-space: nowrap
- color: #e8eef7

.btnSoft:
- border-radius: 999px
- border: 1px solid rgba(42,57,82,.7)
- background: rgba(0,0,0,.18) for topbar use
- color: #e8eef7
- font-weight: 800
- font-size: 12px
- letter-spacing: 0.2px
- padding: 7px 10px
- display: inline-flex
- align-items: center
- gap: 8px
- text-decoration: none

Important:
For topbar buttons, use the category page’s normalized topbar button styling.
Do not mix larger btnSoft variants into the header on some pages.

6) First section spacing
------------------------
After the header, the first content block should visually align like the category page.
Do NOT let pages sit tighter or lower than others because of:
- extra .screen padding
- missing section top spacing
- sticky header leftovers
- different shell widths

Rule:
- keep header spacing from .topbar only
- do not add extra page-level offset hacks
- first major card/hero should sit naturally under header using shared shell spacing

7) Footer baseline
------------------
Use this shared footer structure site-wide unless there is a very specific page reason:

<footer class="siteFooter">
  <div class="footerMeta">© <span id="footerYear"></span> Snapshift Puzzles</div>
  <div class="footerLinks">
    <a class="footerLink" href="/about.html">About</a>
    <a class="footerLink" href="/contact.html">Contact</a>
    <a class="footerLink" href="/daily-archive.html">Daily Archive</a>
  </div>
</footer>

Footer CSS:
- margin-top: 18px
- display: flex
- justify-content: space-between
- align-items: center
- gap: 10px
- padding: 8px 6px 2px
- flex-wrap: wrap
- opacity: .95

.footerMeta:
- opacity: .86
- font-size: 12px
- font-weight: 800

.footerLinks:
- display: flex
- align-items: center
- gap: 10px
- flex-wrap: wrap

.footerLink:
- border-radius: 999px
- border: 1px solid rgba(42,57,82,.7)
- background: rgba(0,0,0,.18)
- color: #e8eef7
- font-weight: 800
- font-size: 12px
- letter-spacing: .2px
- padding: 7px 10px
- display: inline-flex
- align-items: center
- gap: 8px
- text-decoration: none

8) Mobile/footer behavior
-------------------------
At max-width 640px:
- footer should center
- footer links should wrap and center
- header right group can wrap, but spacing and sizing should remain the same

9) Rules to prevent drift
-------------------------
Do not allow:
- 1080px shell on one page and 1200px on another
- .screen padding on one page and not another
- different logo heights page by page
- different topbar padding page by page
- different footer link sets unless explicitly intended
- different button sizing in header unless truly page-specific
- raw debug/dev notes visible in live page content

10) Best implementation approach
--------------------------------
Recommended next step:
Create one shared layout file and patch pages to use it.

Suggested shared files:
- /css/site-layout.css
- shared header block / partial
- shared footer block / partial

Patch order:
1. category.html stays source-of-truth
2. index.html
3. daily-archive.html
4. about.html
5. contact.html
6. shop.html
7. how-scoring-works.html
8. swap-hint-guide.html

11) Header content guidance by page
-----------------------------------
Structure stays the same, but right-side controls can vary.

Examples:
- index:
  points / auth / shop / continue
- category:
  auth / home / shop / play / points
- daily archive:
  points / auth / shop / continue
- about/contact/shop/guides:
  auth / home or shop / page-appropriate links

But the visual layout must stay on the same baseline.

12) Summary
-----------
Category page is now the master layout reference.
All other pages should inherit:
- shell width
- topbar spacing
- logo size
- header button sizing
- footer structure
- footer spacing
