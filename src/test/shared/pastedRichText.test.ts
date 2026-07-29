import { describe, expect, it } from 'vitest';
import {
  normalizePastedCommentHtml,
  normalizePastedTaskHtml,
} from '@/shared/lib/pastedRichText';

// Trimmed copy of what Bitrix24's chat actually put on the clipboard when a
// user pasted three messages into a task description (prod task
// "Viewer. Доработать выгрузку", 2026-07-29). It carries the chat's own
// layout: an absolutely-positioned action toolbar with background-image
// icons, a tinted message bubble, and the author name / timestamp hidden in
// off-screen 1px nodes.
const BITRIX_CHAT_PASTE = `
<div style="margin: 0px; padding: 0px; color: rgb(65, 75, 85); font-family: arial, verdana, tahoma; font-size: 13px; background-color: rgb(255, 255, 255);">
  <div data-post-id="6043018985782" style="margin: 0px 16px 0px 0px; padding: 4px 0px; position: relative; border-radius: 3px; background-color: rgb(245, 249, 250);">
    <div style="margin: 0px; padding: 3px 6px; position: absolute; right: 32px; top: -26px; border-radius: 6px; box-shadow: rgba(0, 0, 0, 0.12) 0px 2px 4px; background: white;">
      <div style="display: inline-block; cursor: pointer; height: 24px; width: 24px; background-image: url(&quot;images/common/1x/a_bt_reaction.png&quot;);"></div>
      <div style="display: inline-block; cursor: pointer; height: 24px; width: 24px; background-image: url(&quot;images/common/1x/a_bt_action.png&quot;);"></div>
    </div>
    <div style="margin: 8px 0px 0px; padding: 0px 0px 0px 70px; color: transparent; line-height: 22px; font-weight: bold; float: left; font-size: 15px; white-space: pre; position: absolute; height: 1px; width: 1px;">Алина Борисова</div>
    <i style="font-size: 0px; width: 1px; color: transparent; height: 0px; display: block; float: left;">[</i>
    <div style="margin: 8px 8px 0px 12px; padding: 0px; display: inline-block; line-height: 22px; color: transparent; float: left; position: absolute; height: 1px; width: 1px; overflow: hidden;">18:25</div>
    <div style="margin: 0px; padding: 0px 0px 0px 70px; line-height: 20px; font-size: 15px; color: rgb(40, 50, 60); clear: both;">
      <div style="margin: 0px; padding: 0px;">
        <div style="margin: 0px; padding: 0px; display: inline;">покраска стены по фильтру не выводится почему-то</div>
      </div>
    </div>
    <div style="margin: 0px; padding: 0px; left: -10000px; top: 0px; visibility: hidden; position: absolute; width: 28px; height: 28px; background-image: url(&quot;images/common/1x/bt_exclamation.png&quot;);"></div>
  </div>
</div>`;

describe('normalizePastedTaskHtml — clipboard from another app', () => {
  const normalized = normalizePastedTaskHtml(BITRIX_CHAT_PASTE);

  it('keeps the message text', () => {
    expect(normalized).toContain('покраска стены по фильтру не выводится почему-то');
  });

  it('drops the source app layout that escapes our own container', () => {
    expect(normalized).not.toContain('position');
    expect(normalized).not.toContain('background');
    expect(normalized).not.toContain('font-family');
    expect(normalized).not.toContain('style=');
  });

  it('drops text the source app deliberately hid off-screen', () => {
    // Stripping styles without removing these first would have made the chat's
    // hidden author name and timestamp visible inside the description.
    expect(normalized).not.toContain('Алина Борисова');
    expect(normalized).not.toContain('18:25');
    expect(normalized).not.toContain('[');
  });

  it('drops the icon-only shells left behind once styles are gone', () => {
    expect(normalized).not.toContain('a_bt_reaction');
    expect(normalized).not.toContain('<div></div>');
  });
});

describe('normalizePastedTaskHtml — formatting we keep', () => {
  it('keeps inline formatting, lists and quotes', () => {
    const normalized = normalizePastedTaskHtml(
      '<p><strong>bold</strong> <em>italic</em> <u>under</u> <s>struck</s></p>'
      + '<ul><li>one</li><li>two</li></ul>'
      + '<ol><li>first</li></ol>'
      + '<blockquote>quoted</blockquote>'
      + 'line<br>break',
    );

    expect(normalized).toContain('<strong>bold</strong>');
    expect(normalized).toContain('<em>italic</em>');
    expect(normalized).toContain('<u>under</u>');
    expect(normalized).toContain('<s>struck</s>');
    expect(normalized).toContain('<li>one</li>');
    expect(normalized).toContain('<ol>');
    expect(normalized).toContain('<blockquote>quoted</blockquote>');
    expect(normalized).toContain('<br>');
  });

  it('keeps an image copied from Motio at its stored size', () => {
    const normalized = normalizePastedTaskHtml(
      '<img src="https://motio.nikog.net/functions/v1/task-media/abc?token=t" alt="image.png"'
      + ' style="width: 342px; height: auto; float: left; border: 1px solid red;">',
    );

    expect(normalized).toContain('src="https://motio.nikog.net/functions/v1/task-media/abc?token=t"');
    expect(normalized).toContain('width: 342px');
    expect(normalized).not.toContain('float');
    expect(normalized).not.toContain('border');
  });

  it('keeps plain text untouched', () => {
    expect(normalizePastedTaskHtml('просто текст')).toBe('просто текст');
  });

  it('keeps a paragraph that only holds a line break', () => {
    expect(normalizePastedTaskHtml('<div><br></div>')).toContain('<br>');
  });

  it('keeps blank lines copied out of an older note', () => {
    // Notes saved before line breaks were normalised to <br> store blank lines
    // as empty <div>s, and `.feedRichText div:empty` gives them their height.
    const normalized = normalizePastedTaskHtml('<div>first</div><div></div><div>second</div>');

    expect(normalized).toBe('<div>first</div><div></div><div>second</div>');
  });
});

describe('normalizePastedTaskHtml — source app bookkeeping', () => {
  it('drops the source app data attributes', () => {
    const normalized = normalizePastedTaskHtml(
      '<div data-post-id="6043018985782" data-thread="12">сообщение</div>',
    );

    expect(normalized).toContain('сообщение');
    expect(normalized).not.toContain('data-post-id');
    expect(normalized).not.toContain('data-thread');
  });

  it('keeps the editor own image markers', () => {
    const normalized = normalizePastedCommentHtml(
      '<span class="rte-image" data-rte-image="true" contenteditable="false">'
      + '<img src="https://motio.nikog.net/x.png" style="width: 200px;">'
      + '<span class="rte-image-handle" data-handle="se"></span></span>',
    );

    expect(normalized).toContain('data-rte-image="true"');
    expect(normalized).toContain('data-handle="se"');
    expect(normalized).toContain('width: 200px');
  });
});

describe('normalizePastedTaskHtml — images we cannot render', () => {
  it.each([
    ['relative to the source app', '<img src="images/common/1x/icon.png">'],
    ['a local file path', '<img src="file:///C:/Users/a/photo.png">'],
    ['an embedded mail part', '<img src="cid:part1.abc@mail">'],
  ])('drops an image that is %s', (_label, html) => {
    expect(normalizePastedTaskHtml(html)).not.toContain('<img');
  });

  it('keeps an inline data image', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(normalizePastedTaskHtml(`<img src="${png}">`)).toContain(png);
  });
});

describe('normalizePastedTaskHtml — hidden node detection', () => {
  it.each([
    ['display:none', '<div style="display: none;">secret</div>'],
    ['visibility:hidden', '<div style="visibility: hidden;">secret</div>'],
    ['zero opacity', '<div style="opacity: 0;">secret</div>'],
    ['transparent text', '<div style="color: transparent;">secret</div>'],
    ['rgba alpha 0', '<div style="color: rgba(0, 0, 0, 0);">secret</div>'],
    ['zero font-size', '<div style="font-size: 0px;">secret</div>'],
    ['parked off-screen', '<div style="position: absolute; left: -10000px;">secret</div>'],
    ['1px absolute box', '<div style="position: absolute; width: 1px; height: 1px;">secret</div>'],
    ['1px clipped box', '<div style="width: 1px; height: 1px; overflow: hidden;">secret</div>'],
  ])('drops content hidden via %s', (_label, html) => {
    expect(normalizePastedTaskHtml(html)).not.toContain('secret');
  });

  it('keeps a hidden wrapper that carries a real image', () => {
    // Losing a user's image to a false positive costs more than a stray node.
    const normalized = normalizePastedTaskHtml(
      '<div style="position: absolute; left: -10000px;"><img src="https://motio.nikog.net/x.png"></div>',
    );

    expect(normalized).toContain('<img');
  });

  it('keeps visible content that merely sits in a positioned wrapper', () => {
    const normalized = normalizePastedTaskHtml(
      '<div style="position: relative; top: 4px;">видимый текст</div>',
    );

    expect(normalized).toContain('видимый текст');
  });
});

describe('normalizePastedCommentHtml', () => {
  it('keeps mention metadata pasted from another comment', () => {
    const normalized = normalizePastedCommentHtml(
      '<span class="mention" data-mention-user-id="u1" data-mention-name="Алекс">@Алекс</span>',
    );

    expect(normalized).toContain('data-mention-user-id="u1"');
    expect(normalized).toContain('@Алекс');
  });

  it('applies the same layout stripping as descriptions', () => {
    const normalized = normalizePastedCommentHtml(BITRIX_CHAT_PASTE);

    expect(normalized).toContain('покраска стены');
    expect(normalized).not.toContain('Алина Борисова');
    expect(normalized).not.toContain('position');
  });
});

describe('normalizePastedRichText — sanitisation still applies', () => {
  it('strips scripts and event handlers from clipboard HTML', () => {
    const normalized = normalizePastedTaskHtml(
      '<div>ok<script>alert(1)</script><img src="https://a.example/x.png" onerror="alert(1)"></div>',
    );

    expect(normalized).toContain('ok');
    expect(normalized).not.toContain('<script');
    expect(normalized).not.toContain('onerror');
  });
});
