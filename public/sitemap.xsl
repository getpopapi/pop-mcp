<?xml version="1.0" encoding="UTF-8"?>
<!--
  Human-readable rendering for POP's XML sitemaps.

  A sitemap is written for crawlers, which ignore this file entirely: the stylesheet is applied by
  the browser, client-side, and changes nothing about the XML a crawler parses. Without it a modern
  browser shows the file as an unreadable wall of concatenated text, which is what anyone opening
  /sitemap.xml by hand sees.

  Shared, byte-identical, across popapi.io, docs.popapi.io, blog.popapi.io and mcp.popapi.io — a
  stylesheet must be same-origin as the XML that references it, so each site carries its own copy.
  Edit one, copy it to the other three. Handles both document types: <sitemapindex> (a list of
  sitemaps) and <urlset> (a list of pages).

  XSLT 1.0 — the only version browsers implement. Self-contained: no external fonts, scripts or
  images, so it renders offline and adds no third-party request to a file crawlers fetch often.
-->
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">

  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"
    doctype-system="about:legacy-compat" />

  <!-- Host of the first entry, used for the page title. Sitemap <loc>s are absolute by spec. -->
  <xsl:variable name="firstLoc" select="(//sm:loc)[1]" />
  <xsl:variable name="host" select="substring-before(substring-after($firstLoc, '://'), '/')" />

  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>XML sitemap · <xsl:value-of select="$host" /></title>
        <style>
          :root {
            --bg: #ffffff;
            --fg: #1a1a1a;
            --muted: #6b6b6b;
            --line: #e6e6e6;
            --accent: #ff5f5e;
            --chip: #d5f4f5;
            --chip-fg: #14595c;
            --row: #fafafa;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --bg: #121212;
              --fg: #f2f2f2;
              --muted: #9a9a9a;
              --line: #2c2c2c;
              --accent: #ff5f5e;
              --chip: #14595c;
              --chip-fg: #d5f4f5;
              --row: #1a1a1a;
            }
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 32px 16px 64px;
            background: var(--bg);
            color: var(--fg);
            font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          }
          .wrap { max-width: 1040px; margin: 0 auto; }
          h1 {
            margin: 0 0 4px;
            font-size: 22px;
            letter-spacing: -0.01em;
          }
          h1 .dot { color: var(--accent); }
          .lede { margin: 0 0 4px; color: var(--muted); }
          .count { margin: 0 0 24px; color: var(--muted); font-variant-numeric: tabular-nums; }
          .count strong { color: var(--fg); }
          table { width: 100%; border-collapse: collapse; font-size: 14px; }
          th, td {
            text-align: left;
            padding: 9px 12px;
            border-bottom: 1px solid var(--line);
            vertical-align: top;
          }
          th {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--muted);
            border-bottom-width: 2px;
            white-space: nowrap;
          }
          tbody tr:nth-child(even) { background: var(--row); }
          td.url { word-break: break-all; }
          td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
          td.date, th.date { white-space: nowrap; color: var(--muted); font-variant-numeric: tabular-nums; }
          a { color: inherit; text-decoration: none; border-bottom: 1px solid var(--accent); }
          a:hover { color: var(--accent); }
          .chip {
            display: inline-block;
            padding: 1px 7px;
            border-radius: 10px;
            background: var(--chip);
            color: var(--chip-fg);
            font-size: 12px;
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
          }
          .foot {
            margin-top: 28px;
            padding-top: 16px;
            border-top: 1px solid var(--line);
            color: var(--muted);
            font-size: 13px;
          }
        </style>
      </head>
      <body>
        <div class="wrap">
          <xsl:apply-templates select="sm:sitemapindex | sm:urlset" />
          <p class="foot">
            Generated for search engines, following the
            <a href="https://www.sitemaps.org/protocol.html">sitemaps.org protocol</a>.
            This table is only how your browser displays the file — crawlers read the XML underneath.
          </p>
        </div>
      </body>
    </html>
  </xsl:template>

  <!-- ============================ sitemap index ============================ -->
  <xsl:template match="sm:sitemapindex">
    <h1>XML sitemap index<span class="dot">.</span></h1>
    <p class="lede"><xsl:value-of select="$host" /></p>
    <p class="count">
      <strong><xsl:value-of select="count(sm:sitemap)" /></strong>
      <xsl:text> </xsl:text>
      <xsl:choose>
        <xsl:when test="count(sm:sitemap) = 1">sitemap</xsl:when>
        <xsl:otherwise>sitemaps</xsl:otherwise>
      </xsl:choose>
      <xsl:text> in this index</xsl:text>
    </p>
    <table>
      <thead>
        <tr>
          <th>Sitemap</th>
          <xsl:if test="sm:sitemap/sm:lastmod"><th class="date">Last modified</th></xsl:if>
        </tr>
      </thead>
      <tbody>
        <xsl:for-each select="sm:sitemap">
          <tr>
            <td class="url">
              <a href="{sm:loc}"><xsl:value-of select="sm:loc" /></a>
            </td>
            <xsl:if test="../sm:sitemap/sm:lastmod">
              <td class="date"><xsl:value-of select="substring(sm:lastmod, 1, 10)" /></td>
            </xsl:if>
          </tr>
        </xsl:for-each>
      </tbody>
    </table>
  </xsl:template>

  <!-- ================================ urlset =============================== -->
  <xsl:template match="sm:urlset">
    <h1>XML sitemap<span class="dot">.</span></h1>
    <p class="lede"><xsl:value-of select="$host" /></p>
    <p class="count">
      <strong><xsl:value-of select="count(sm:url)" /></strong>
      <xsl:text> </xsl:text>
      <xsl:choose>
        <xsl:when test="count(sm:url) = 1">URL</xsl:when>
        <xsl:otherwise>URLs</xsl:otherwise>
      </xsl:choose>
    </p>
    <table>
      <thead>
        <tr>
          <th>URL</th>
          <xsl:if test="sm:url/xhtml:link"><th class="num">Languages</th></xsl:if>
          <xsl:if test="sm:url/sm:lastmod"><th class="date">Last modified</th></xsl:if>
          <xsl:if test="sm:url/sm:changefreq"><th>Change freq.</th></xsl:if>
          <xsl:if test="sm:url/sm:priority"><th class="num">Priority</th></xsl:if>
        </tr>
      </thead>
      <tbody>
        <xsl:for-each select="sm:url">
          <tr>
            <td class="url">
              <a href="{sm:loc}"><xsl:value-of select="sm:loc" /></a>
            </td>
            <xsl:if test="../sm:url/xhtml:link">
              <td class="num">
                <xsl:if test="xhtml:link">
                  <span class="chip">
                    <xsl:value-of select="count(xhtml:link[@hreflang != 'x-default'])" />
                  </span>
                </xsl:if>
              </td>
            </xsl:if>
            <xsl:if test="../sm:url/sm:lastmod">
              <td class="date"><xsl:value-of select="substring(sm:lastmod, 1, 10)" /></td>
            </xsl:if>
            <xsl:if test="../sm:url/sm:changefreq">
              <td><xsl:value-of select="sm:changefreq" /></td>
            </xsl:if>
            <xsl:if test="../sm:url/sm:priority">
              <td class="num"><xsl:value-of select="sm:priority" /></td>
            </xsl:if>
          </tr>
        </xsl:for-each>
      </tbody>
    </table>
  </xsl:template>
</xsl:stylesheet>
