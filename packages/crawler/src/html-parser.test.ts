import { describe, it, expect } from 'vitest';
import { extractHtml } from './html-parser.js';

describe('extractHtml', () => {
  describe('meta tag extraction', () => {
    it('extracts a single meta tag with name and content', () => {
      const html = '<html><head><meta name="generator" content="WordPress 6.4"></head></html>';
      const result = extractHtml(html);

      expect(result.metaTags).toHaveLength(1);
      expect(result.metaTags[0]).toEqual({ name: 'generator', content: 'WordPress 6.4' });
    });

    it('extracts multiple meta tags', () => {
      const html =
        '<html><head>' +
        '<meta name="description" content="A blog">' +
        '<meta name="generator" content="Hugo">' +
        '<meta name="viewport" content="width=device-width">' +
        '</head></html>';
      const result = extractHtml(html);

      expect(result.metaTags).toHaveLength(3);
      expect(result.metaTags[0]).toEqual({ name: 'description', content: 'A blog' });
      expect(result.metaTags[1]).toEqual({ name: 'generator', content: 'Hugo' });
      expect(result.metaTags[2]).toEqual({ name: 'viewport', content: 'width=device-width' });
    });

    it('handles case-insensitive meta tag names', () => {
      const html = '<meta NAME="GENERATOR" CONTENT="Jekyll">';
      const result = extractHtml(html);

      expect(result.metaTags).toHaveLength(1);
      expect(result.metaTags[0]).toEqual({ name: 'GENERATOR', content: 'Jekyll' });
    });

    it('preserves original casing of name and content', () => {
      const html = '<meta name="Generator" content="Next.js Site">';
      const result = extractHtml(html);

      expect(result.metaTags[0]!.name).toBe('Generator');
      expect(result.metaTags[0]!.content).toBe('Next.js Site');
    });

    it('handles single-quoted attribute values', () => {
      const html = "<meta name='generator' content='WordPress'>";
      const result = extractHtml(html);

      expect(result.metaTags).toHaveLength(1);
      expect(result.metaTags[0]).toEqual({ name: 'generator', content: 'WordPress' });
    });

    it('handles swapped attribute order (content before name)', () => {
      const html = '<meta content="Hugo" name="generator">';
      const result = extractHtml(html);

      expect(result.metaTags).toHaveLength(1);
      expect(result.metaTags[0]).toEqual({ name: 'generator', content: 'Hugo' });
    });

    it('skips meta tags without a name attribute', () => {
      const html = '<meta content="no-name-tag">';
      const result = extractHtml(html);

      expect(result.metaTags).toHaveLength(0);
    });

    it('skips meta tags without a content attribute', () => {
      const html = '<meta name="generator">';
      const result = extractHtml(html);

      expect(result.metaTags).toHaveLength(0);
    });

    it('returns empty array when no meta tags are present', () => {
      const html = '<html><head><title>No meta tags</title></head></html>';
      const result = extractHtml(html);

      expect(result.metaTags).toEqual([]);
    });

    it('returns empty array for empty HTML', () => {
      const result = extractHtml('');
      expect(result.metaTags).toEqual([]);
    });

    it('extracts both description and meta tags', () => {
      const html =
        '<html><head>' +
        '<meta name="description" content="A blog">' +
        '<meta name="generator" content="WordPress 6.4">' +
        '</head></html>';
      const result = extractHtml(html);

      expect(result.description).toBe('A blog');
      expect(result.metaTags).toHaveLength(2);
      expect(result.metaTags[0]!.name).toBe('description');
      expect(result.metaTags[1]!.name).toBe('generator');
    });

    it('handles meta tags with extra attributes', () => {
      const html =
        '<meta name="generator" content="Ghost" property="article:tag" data-testid="meta">';
      const result = extractHtml(html);

      expect(result.metaTags).toHaveLength(1);
      expect(result.metaTags[0]).toEqual({ name: 'generator', content: 'Ghost' });
    });

    it('handles self-closing meta tags', () => {
      const html = '<meta name="generator" content="Gatsby" />';
      const result = extractHtml(html);

      expect(result.metaTags).toHaveLength(1);
      expect(result.metaTags[0]).toEqual({ name: 'generator', content: 'Gatsby' });
    });
  });

  describe('title extraction (unchanged)', () => {
    it('still extracts title', () => {
      const html = '<html><head><title>My Page</title></head></html>';
      const result = extractHtml(html);
      expect(result.title).toBe('My Page');
    });
  });

  describe('description extraction (unchanged)', () => {
    it('still extracts description from meta description tag', () => {
      const html = '<meta name="description" content="An example page for testing">';
      const result = extractHtml(html);
      expect(result.description).toBe('An example page for testing');
    });

    it('returns null description when no meta description tag', () => {
      const html = '<meta name="generator" content="Next.js">';
      const result = extractHtml(html);
      expect(result.description).toBeNull();
    });
  });

  describe('script extraction', () => {
    it('extracts a script with src attribute', () => {
      const html = '<script src="https://cdn.jsdelivr.net/jquery.min.js"></script>';
      const result = extractHtml(html);

      expect(result.scripts).toHaveLength(1);
      expect(result.scripts[0]).toEqual({
        src: 'https://cdn.jsdelivr.net/jquery.min.js',
        content: '',
      });
    });

    it('extracts an inline script (null src) with content', () => {
      const html = '<script>var x = 1;</script>';
      const result = extractHtml(html);

      expect(result.scripts).toHaveLength(1);
      expect(result.scripts[0]).toEqual({
        src: null,
        content: 'var x = 1;',
      });
    });

    it('extracts src-only script with empty content', () => {
      const html = '<script src="/static/main.js"></script>';
      const result = extractHtml(html);

      expect(result.scripts[0]).toEqual({
        src: '/static/main.js',
        content: '',
      });
    });

    it('extracts multiple scripts in document order', () => {
      const html =
        '<script src="/assets/vendor.js"></script>' +
        '<script>var app = {};</script>' +
        '<script src="/assets/main.js"></script>';
      const result = extractHtml(html);

      expect(result.scripts).toHaveLength(3);
      expect(result.scripts[0]).toEqual({ src: '/assets/vendor.js', content: '' });
      expect(result.scripts[1]).toEqual({ src: null, content: 'var app = {};' });
      expect(result.scripts[2]).toEqual({ src: '/assets/main.js', content: '' });
    });

    it('handles case-insensitive script tag names', () => {
      const html = '<SCRIPT SRC="/app.js"></SCRIPT>';
      const result = extractHtml(html);

      expect(result.scripts).toHaveLength(1);
      expect(result.scripts[0]!.src).toBe('/app.js');
    });

    it('handles single-quoted src attribute', () => {
      const html = "<script src='/app.js'></script>";
      const result = extractHtml(html);

      expect(result.scripts).toHaveLength(1);
      expect(result.scripts[0]!.src).toBe('/app.js');
    });

    it('handles unquoted src attribute', () => {
      const html = '<script src=/app.js></script>';
      const result = extractHtml(html);

      expect(result.scripts).toHaveLength(1);
      expect(result.scripts[0]!.src).toBe('/app.js');
    });

    it('trims whitespace from inline script content', () => {
      const html = '<script>\n  console.log("hello");\n</script>';
      const result = extractHtml(html);

      expect(result.scripts).toHaveLength(1);
      expect(result.scripts[0]!.content).toBe('console.log("hello");');
    });

    it('handles script tags with extra attributes', () => {
      const html = '<script type="module" crossorigin defer src="/module.js"></script>';
      const result = extractHtml(html);

      expect(result.scripts).toHaveLength(1);
      expect(result.scripts[0]).toEqual({ src: '/module.js', content: '' });
    });

    it('handles inline script with attributes', () => {
      const html = '<script type="text/javascript">var x = 1;</script>';
      const result = extractHtml(html);

      expect(result.scripts).toHaveLength(1);
      expect(result.scripts[0]).toEqual({
        src: null,
        content: 'var x = 1;',
      });
    });

    it('returns empty scripts array when no script tags are present', () => {
      const html = '<html><head><title>No scripts</title></head></html>';
      const result = extractHtml(html);

      expect(result.scripts).toEqual([]);
    });

    it('returns empty scripts array for empty HTML', () => {
      const result = extractHtml('');
      expect(result.scripts).toEqual([]);
    });

    it('extracts scripts alongside meta tags and title', () => {
      const html =
        '<html><head>' +
        '<title>Page</title>' +
        '<meta name="generator" content="WordPress">' +
        '<script src="/wp-content/app.js"></script>' +
        '<script>var config = {};</script>' +
        '</head></html>';
      const result = extractHtml(html);

      expect(result.title).toBe('Page');
      expect(result.metaTags).toHaveLength(1);
      expect(result.scripts).toHaveLength(2);
      expect(result.scripts[0]).toEqual({ src: '/wp-content/app.js', content: '' });
      expect(result.scripts[1]).toEqual({ src: null, content: 'var config = {};' });
    });
  });

  describe('link extraction (Step 6H)', () => {
    it('extracts a single stylesheet link', () => {
      const html = '<html><head><link rel="stylesheet" href="/app.css"></head></html>';
      const result = extractHtml(html);

      expect(result.stylesheetLinks).toHaveLength(1);
      expect(result.stylesheetLinks[0]).toBe('/app.css');
    });

    it('extracts a manifest link', () => {
      const html = '<html><head><link rel="manifest" href="/manifest.json"></head></html>';
      const result = extractHtml(html);

      expect(result.manifestLink).toBe('/manifest.json');
    });

    it('extracts multiple stylesheet links in document order', () => {
      const html =
        '<html><head>' +
        '<link rel="stylesheet" href="/first.css">' +
        '<link rel="stylesheet" href="/second.css">' +
        '<link rel="stylesheet" href="/third.css">' +
        '</head></html>';
      const result = extractHtml(html);

      expect(result.stylesheetLinks).toHaveLength(3);
      expect(result.stylesheetLinks[0]).toBe('/first.css');
      expect(result.stylesheetLinks[1]).toBe('/second.css');
      expect(result.stylesheetLinks[2]).toBe('/third.css');
    });

    it('preserves duplicate stylesheet links (deduplication happens at crawler level)', () => {
      const html =
        '<html><head>' +
        '<link rel="stylesheet" href="/dup.css">' +
        '<link rel="stylesheet" href="/dup.css">' +
        '</head></html>';
      const result = extractHtml(html);

      expect(result.stylesheetLinks).toHaveLength(2);
      expect(result.stylesheetLinks[0]).toBe('/dup.css');
      expect(result.stylesheetLinks[1]).toBe('/dup.css');
    });

    it('extracts relative stylesheet URLs as-is', () => {
      const html = '<html><head><link rel="stylesheet" href="styles/app.css"></head></html>';
      const result = extractHtml(html);

      expect(result.stylesheetLinks).toEqual(['styles/app.css']);
    });

    it('extracts absolute stylesheet URLs', () => {
      const html =
        '<html><head><link rel="stylesheet" href="https://example.com/assets/style.css"></head></html>';
      const result = extractHtml(html);

      expect(result.stylesheetLinks).toEqual(['https://example.com/assets/style.css']);
    });

    it('ignores link tags that are not stylesheet or manifest', () => {
      const html =
        '<html><head>' +
        '<link rel="icon" href="/favicon.ico">' +
        '<link rel="preconnect" href="https://cdn.example.com">' +
        '<link rel="canonical" href="https://example.com/canonical">' +
        '</head></html>';
      const result = extractHtml(html);

      expect(result.stylesheetLinks).toEqual([]);
      expect(result.manifestLink).toBeNull();
    });
  });

  describe('link tag extraction (Step 6J)', () => {
    it('extracts a single link tag with rel and href', () => {
      const html = '<html><head><link rel="stylesheet" href="/app.css"></head></html>';
      const result = extractHtml(html);

      expect(result.linkTags).toHaveLength(1);
      expect(result.linkTags[0]).toEqual({
        rel: 'stylesheet',
        href: '/app.css',
        content: '<link rel="stylesheet" href="/app.css">',
      });
    });

    it('extracts multiple link tags in document order', () => {
      const html =
        '<html><head>' +
        '<link rel="stylesheet" href="/first.css">' +
        '<link rel="icon" href="/favicon.ico">' +
        '<link rel="manifest" href="/manifest.json">' +
        '</head></html>';
      const result = extractHtml(html);

      expect(result.linkTags).toHaveLength(3);
      expect(result.linkTags[0]).toMatchObject({ rel: 'stylesheet', href: '/first.css' });
      expect(result.linkTags[1]).toMatchObject({ rel: 'icon', href: '/favicon.ico' });
      expect(result.linkTags[2]).toMatchObject({ rel: 'manifest', href: '/manifest.json' });
    });

    it('captures link tag without rel attribute (rel = null)', () => {
      const html = '<link href="/no-rel.css">';
      const result = extractHtml(html);

      expect(result.linkTags).toHaveLength(1);
      expect(result.linkTags[0]!.rel).toBeNull();
      expect(result.linkTags[0]!.href).toBe('/no-rel.css');
    });

    it('captures link tag without href attribute (href = null)', () => {
      const html = '<link rel="stylesheet">';
      const result = extractHtml(html);

      expect(result.linkTags).toHaveLength(1);
      expect(result.linkTags[0]!.rel).toBe('stylesheet');
      expect(result.linkTags[0]!.href).toBeNull();
    });

    it('captures link tag with no attributes', () => {
      const html = '<link>';
      const result = extractHtml(html);

      expect(result.linkTags).toHaveLength(1);
      expect(result.linkTags[0]!.rel).toBeNull();
      expect(result.linkTags[0]!.href).toBeNull();
      expect(result.linkTags[0]!.content).toBe('<link>');
    });

    it('handles case-insensitive link tag names and attributes', () => {
      const html = '<LINK REL="STYLESHEET" HREF="/style.css">';
      const result = extractHtml(html);

      expect(result.linkTags).toHaveLength(1);
      expect(result.linkTags[0]!.rel).toBe('STYLESHEET');
      expect(result.linkTags[0]!.href).toBe('/style.css');
    });

    it('handles single-quoted and unquoted attribute values', () => {
      const html =
        "<link rel='stylesheet' href='/single.css'>" + '<link rel=icon href=/unquoted.css>';
      const result = extractHtml(html);

      expect(result.linkTags).toHaveLength(2);
      expect(result.linkTags[0]!.href).toBe('/single.css');
      expect(result.linkTags[1]!.href).toBe('/unquoted.css');
    });

    it('handles link tags with extra attributes (media, sizes, as)', () => {
      const html =
        '<link rel="stylesheet" href="/style.css" media="screen" crossorigin>' +
        '<link rel="preload" href="/font.woff2" as="font" type="font/woff2">';
      const result = extractHtml(html);

      expect(result.linkTags).toHaveLength(2);
      expect(result.linkTags[0]!.rel).toBe('stylesheet');
      expect(result.linkTags[0]!.href).toBe('/style.css');
      expect(result.linkTags[1]!.rel).toBe('preload');
      expect(result.linkTags[1]!.href).toBe('/font.woff2');
    });

    it('handles space-separated rel values', () => {
      const html = '<link rel="preload stylesheet" href="/preload.css">';
      const result = extractHtml(html);

      expect(result.linkTags).toHaveLength(1);
      expect(result.linkTags[0]!.rel).toBe('preload stylesheet');
    });

    it('preserves document order including duplicate hrefs', () => {
      const html =
        '<link rel="stylesheet" href="/dup.css">' + '<link rel="stylesheet" href="/dup.css">';
      const result = extractHtml(html);

      expect(result.linkTags).toHaveLength(2);
      expect(result.linkTags[0]!.href).toBe('/dup.css');
      expect(result.linkTags[1]!.href).toBe('/dup.css');
    });

    it('returns empty linkTags when no link tags are present', () => {
      const html = '<html><head><title>No links</title></head></html>';
      const result = extractHtml(html);

      expect(result.linkTags).toEqual([]);
    });

    it('returns empty linkTags for empty HTML', () => {
      const result = extractHtml('');
      expect(result.linkTags).toEqual([]);
    });

    it('extracts linkTags alongside other HTML elements', () => {
      const html =
        '<html><head>' +
        '<title>Page</title>' +
        '<meta name="description" content="Test">' +
        '<link rel="stylesheet" href="/style.css">' +
        '<script src="/app.js"></script>' +
        '</head></html>';
      const result = extractHtml(html);

      expect(result.title).toBe('Page');
      expect(result.metaTags).toHaveLength(1);
      expect(result.scripts).toHaveLength(1);
      expect(result.linkTags).toHaveLength(1);
      expect(result.linkTags[0]).toMatchObject({ rel: 'stylesheet', href: '/style.css' });
    });
  });
});
