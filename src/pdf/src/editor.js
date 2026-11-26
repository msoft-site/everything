import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'virtual:pdf-worker-url';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { loadPdfDocument, savePdf } from './core/version.js';
import { indexPageText, searchQuery } from './core/search.js';
import { inspectText, matrix, textColor } from './core/text-edit.js';
import { groupTextRuns, replaceTextGroup } from './core/text-group.js';
import { draftText, needsDraftText, textLineInput } from './text-line-input.js';
import { groupTextParagraphs } from './core/text-paragraph.js';
import { readingOrder, reorderSegments, reorderText } from './core/bidi.js';
import { textPositionControls } from './text-position.js';
import { placeTextCaret } from './text-caret.js';
import { textWidthControls } from './text-width.js';
import { createFormLayer } from './form-layer.js';
import { choiceInputOptions } from './core/form-draft.js';
import { createImageLayer } from './image-layer.js';
import { createPropertiesPanel } from './properties-panel.js';
import { createToolsPanel } from './shell/tools-panel.js';
import { toolIcon } from './shell/icons.js';
import { createPageStack } from './page-stack.js';
import { createOrganizeView } from './organize-view.js';
import { inspectImages, editImage, imagePreview, replaceImage } from './core/image-edit.js';
import { inspectPaths, editPath, pathPreview } from './core/path-edit.js';
import { selectedTextQuads, alignTextLayer, pageTextRange } from './text-selection.js';
import { addHighlight, listHighlights, editHighlight, MARKUP_KINDS } from './core/highlight.js';
import { openMenu as showMenu, createMenubar, closeMenu } from './lib/menu.js';
import { parsePageRange, formatPageRange, extractPages } from './core/pages.js';
import { printPages, pageImage } from './print.js';
import { signatureDialog } from './signature-dialog.js';
import { drawSignature } from './core/signature.js';
import { enableThumbnailReorder } from './page-organizer.js';
import { addNote, listNotes, editNote, NOTE_SIZE } from './core/notes.js';
import { pageSpeechText, speechChunks } from './core/speech.js';
import { createOutlinePanel, destinationPage, destinationTarget } from './outline.js';
import { createCommentsPanel } from './comments.js';
import { appsButton } from './apps-panel.js';
import { userMenuSlot } from './user-menu.js';
import { createAttachmentsPanel, createLayersPanel } from './side-panels.js';
import { createSignaturesPanel, createSignatureBar } from './signatures-panel.js';
import { chooseDigitalId, signatureDetailsDialog } from './digital-id-dialog.js';
import { addAttachment, attachmentBytes, removeAttachment } from './core/attachments.js';
import {
  listFonts,
  readInitialView,
  readPdfaClaim,
  writeInitialView,
} from './core/initial-view.js';
import { createAccessibilityReport } from './accessibility-report.js';
import { createFormDesigner, fieldTypeLabel } from './form-designer.js';
import { createAnnotationLayer, ANNOTATION_KINDS } from './annotation-layer.js';
import { measureLabel, MEASURE_UNITS } from './core/measure.js';
import {
  addTextBox,
  addCallout,
  addShapeAnnotation,
  addInkAnnotation,
  listAnnotations,
  editAnnotation,
  deleteAnnotation,
  addReply,
  setReviewState,
  groupAnnotation,
  exportXfdf,
  importXfdf,
  MAX_XFDF_SIZE,
  exportCommentSummary,
  annotationAccepts,
  REVIEW_STATES,
} from './core/annotations.js';
import { ensureStyledFontFaces, cjkDraftFace } from './text-fonts.js';
import {
  documentAccess,
  requireDocumentAccess,
  passwordsSupported,
  protectPdf,
} from './core/security.js';
import { compressPdf, COMPRESSION_LEVELS } from './core/compress.js';
import { createImageCodec, normalizeImageFiles } from './image-codec.js';
import { addImagePages, defaultPaper } from './core/image-pages.js';
import { cropMargins, cropPages, resetCrop } from './core/crop.js';
import { drawStamp } from './core/stamp.js';
import { addLink, normalizeUrl, removeLink, safeLinkUrl, updateLink } from './core/links.js';
import { annotationLayerVisible } from './core/optional-content.js';
import { flattenCounts, flattenDocument } from './core/flatten.js';
import {
  MAX_SPLIT_FILES,
  parseSplitPoints,
  splitPdf,
  splitRanges,
  zipParts,
} from './core/split.js';
import { addBookmark, removeBookmark, renameBookmark } from './core/outline-edit.js';
import { stampDialog } from './stamp-dialog.js';
import {
  addWatermark,
  addPageNumbers,
  addHeaderFooter,
  HEADER_SLOTS,
  WATERMARK_SIZES,
  NUMBER_FORMATS,
  NUMBER_POSITIONS,
} from './core/page-marks.js';
import { protectDialog } from './protect-dialog.js';
import { promptUnlock, promptOwner } from './unlock-dialog.js';
import {
  el,
  icon,
  appIcon,
  button,
  iconButton,
  formatShortcut,
  modal as showModal,
  dialogVersion,
  beginDialogRequest,
  confirmAction as askConfirmation,
  promptText as askText,
  toast,
  download,
  copyText,
  formatBytes,
  contrastInk,
} from './lib/ui.js';
import * as P from './lib/puter.js';
import { waitFor } from './lib/abort.js';
import {
  safeName,
  validatePdf,
  rotatePage,
  rotatePages,
  rotateAllPages,
  deletePage,
  deletePages as deleteDocumentPages,
  movePage,
  reorderPages,
  insertBlankPage,
  insertPdfPages,
  duplicatePage,
  duplicatePages,
  addText,
  textVariant,
  hasCjkText,
  addImage,
  drawMark,
  arrowHead,
  normalizeRect,
  listFields,
  formButtonSelections,
  formFieldTooltips,
  radioButtonChoices,
  sharedChoiceSelections,
  fillFields,
  flattenFonts,
  MAX_FILE_SIZE,
  MAX_IMAGE_SIZE,
  MAX_PAGES,
} from './core/document.js';
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
// Tools used now and then load on first use, keeping the editor itself quick to start.
const loadRedaction = () => import('./core/redact.js');
const loadSanitize = () => import('./core/sanitize.js');
const loadForms = () => import('./core/form-create.js');
// One worker serves every document and preview. Left to itself, getDocument starts a new
// worker per call and destroying the document terminates it, so each edit (which reloads the
// document) and each draft preview paid for a worker start before any parsing began.
let sharedWorker = null;
const pdfWorker = () => {
  if (!sharedWorker || sharedWorker.destroyed) {
    const worker = (sharedWorker = new pdfjs.PDFWorker({ name: 'pdf-editor' }));
    // A worker that failed to start is not kept, so the next open can try again.
    worker.promise.catch(() => {
      if (sharedWorker === worker) sharedWorker = null;
    });
  }
  return sharedWorker;
};
/**
 * A PDF.js page's visible area in its own user units, which its text is measured in. Viewports
 * are in points, a page's UserUnit times larger along each side.
 */
const userArea = (pdfPage) => {
  const [x0, y0, x1, y1] = pdfPage.view;
  return Math.abs((x1 - x0) * (y1 - y0));
};
const loadPdf = (bytes) =>
  pdfjs.getDocument({
    data: bytes,
    worker: pdfWorker(),
    isEvalSupported: false,
    enableXfa: false,
    cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
    wasmUrl: `${import.meta.env.BASE_URL}pdfjs/wasm/`,
    iccUrl: `${import.meta.env.BASE_URL}pdfjs/iccs/`,
  });

/** Publish a completed bitmap in one task, so clearing/resizing never reaches the screen. */
function paintCanvas(canvas, rendered, viewport) {
  if (canvas.width !== rendered.width) canvas.width = rendered.width;
  if (canvas.height !== rendered.height) canvas.height = rendered.height;
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  canvas.getContext('2d').drawImage(rendered, 0, 0);
}

export function createEditor({
  root,
  session,
  name,
  path,
  remote: initialRemote = null,
  // The new, empty PDF the app opens with (or New blank PDF), rather than a file.
  blank = false,
  settings,
  getUser,
  signedOut = () => false,
  signIn,
  goHome,
  onOpen,
  onOpenCloud,
  onNew,
  onOpenBytes = null,
  shortcuts,
  protection: initialProtection = null,
  encryptedOriginal = null,
}) {
  // Dialogs belong to this document, including ones opened after an asynchronous file read.
  // Replacing the editor cancels their choices and leaves the new document interactive.
  const dialogController = new AbortController();
  const dialogOptions = { signal: dialogController.signal };
  const modal = (title, content, actions) => showModal(title, content, actions, dialogOptions);
  const confirmAction = (title, message, label) =>
    askConfirmation(title, message, label, dialogOptions);
  const promptText = (title, label, value) => askText(title, label, value, dialogOptions);
  let pdf,
    loadingTask,
    currentPage,
    pageIndex = 0,
    pageCount = 0,
    pendingNavigation = null,
    navigationGeneration = 0,
    viewport,
    pageReady = false,
    renderedWorkspaceWidth = 0,
    renderedWorkspaceHeight = 0,
    // The page sizes arrived after the fitted zoom was chosen from the first page's alone.
    fitSizesStale = false,
    tool = 'select',
    destroyed = false,
    busy = true,
    initializing = true,
    saving = false,
    generation = 0,
    renderTask,
    textLayer,
    pageTextIndex,
    scaleMode = 'fit',
    pendingZoom = null,
    zoom = 1;
  let pagePixelRatio = 1;
  let toolsBusy = null; // the busy state the tools pane last showed
  let shownTitle = null; // the document's own title, when it asks to be shown by it
  let pdfaClaim = null; // the PDF/A level the file claims, read when it opens or is converted
  let thumbnailObserver,
    searchGeneration = 0,
    pendingSearch = null,
    matchedQuery = '',
    searchResults = [], // pages with matches, in order: { page, count }
    activeMatch = -1; // index of the current match across the document
  // The cloud file as it was last read or written here: saving checks it is still that file.
  let remote = initialRemote;
  let cloudRevision = path ? session.revision : null,
    downloadedRevision = null,
    downloading = false,
    saveController = null,
    saveGeneration = 0;
  // Keep the decrypted working copy private; the authenticated role gates editor actions
  // and the original encryption follows every exported PDF until its owner changes it.
  let protection = initialProtection,
    protectionDirty = false,
    activity = null;
  const access = () => documentAccess(protection);
  const requireAccess = (...actions) => requireDocumentAccess(protection, ...actions);
  const toolPermission = (id) =>
    id === 'select' || id === 'hand'
      ? null
      : ['highlight', 'note', 'link', 'textbox', 'callout', 'cshape', 'pencil', 'measure'].includes(
            id,
          )
        ? 'annotate'
        : id === 'certsign'
          ? 'fill'
          : 'edit';
  let color = '#111111',
    stroke = 2,
    textSize = 16,
    textBold = false,
    textItalic = false,
    textUnderline = false,
    textStrikethrough = false;
  // Night reading: the page and its drafts are shown with inverted colors, remembered on
  // this device like the theme.
  const DARK_PAGES_KEY = 'pdf-editor:page-colors';
  let darkPages = (() => {
    try {
      return localStorage.getItem(DARK_PAGES_KEY) === 'dark';
    } catch {
      return false;
    }
  })();
  function setDarkPages(on) {
    darkPages = on;
    editorRoot.classList.toggle('dark-pages', on);
    try {
      if (on) localStorage.setItem(DARK_PAGES_KEY, 'dark');
      else localStorage.removeItem(DARK_PAGES_KEY);
    } catch {
      /* The preference is optional. */
    }
  }
  // Text and drawings share a color; highlights and notes keep their own.
  const toolColors = {
    mark: '#111111',
    highlight: '#f2c438',
    note: '#f2c438',
    comment: '#e5322d',
  };
  // Comments drawn as annotations: text boxes, callouts, shapes, and the pencil.
  const COMMENT_TOOLS = ['textbox', 'callout', 'cshape', 'pencil', 'measure'];
  // Freehand strokes, crops, and measurements have nothing to place at the page center.
  const UNPLACEABLE = ['ink', 'crop', 'pencil', 'measure'];
  let commentSize = 12;
  const colorGroup = () =>
    tool === 'highlight'
      ? 'highlight'
      : tool === 'note'
        ? 'note'
        : COMMENT_TOOLS.includes(tool)
          ? 'comment'
          : 'mark';
  let gesture = null;
  let committingDrawing = false;
  let editDocument,
    textEdit = null,
    finishingText = null,
    textCheckpoint = null,
    textPointer = null,
    textSelectionVersion = 0,
    textRuns = [];
  const textRunCache = new Map();
  const imageRunCache = new Map();
  /** Folded page text for find, extracted once per page and document revision. */
  const searchTextCache = new Map();
  let notes = [],
    noteEdit = null;
  let selectedHighlight = null,
    highlights = [],
    highlightSelection = null;
  // The current page's comments with their replies and review status, read when first asked.
  let commentThreads = null;
  function threadOf(id) {
    if (!editDocument) return null;
    try {
      commentThreads ??= new Map(listAnnotations(editDocument, pageIndex).map((a) => [a.id, a]));
    } catch {
      commentThreads = new Map();
    }
    return commentThreads.get(id) ?? null;
  }
  const safe =
    (fn) =>
    async (...args) => {
      try {
        return await fn(...args);
      } catch (e) {
        if (destroyed || P.isSignInCancelled(e)) return;
        toast(e.message || '操作无法完成。', { error: true });
      }
    };
  function permissionMenu(items) {
    return items.map((item) => {
      if (!item) return item;
      const permissions = item.permission ? [item.permission].flat() : [];
      return {
        ...item,
        disabled: item.disabled || permissions.some((key) => !access()[key]),
        ...(item.items && { items: permissionMenu(item.items) }),
        ...(permissions.length &&
          item.onSelect && {
            onSelect: safe(async (...args) => {
              requireAccess(...permissions);
              await item.onSelect(...args);
            }),
          }),
      };
    });
  }
  const openMenu = (options) => showMenu({ ...options, items: permissionMenu(options.items) });
  const nameButton = button(
    name.replace(/\.pdf$/i, ''),
    null,
    safe(async () => {
      if (saving || busy) return;
      const next = await promptText('为 PDF 命名', '文件名', name.replace(/\.pdf$/i, ''));
      const nextName = next && safeName(next);
      if (!nextName || nextName === name || destroyed) return;
      // A PDF in Puter belongs to the signed-in account; settle a pending account check first.
      // Its path is cleared if that account ended, and the PDF is then renamed here alone.
      if (path && !getUser()) await signIn();
      if (destroyed) return;
      if (path) {
        if (saving || busy || !getUser())
          throw new Error('当前无法重命名文件，请稍后重试。');
        // A PDF saved in Puter is renamed where it is, as the file manager would: saving it
        // under a new name used to leave the old file behind beside a second copy.
        saveGeneration++;
        saving = true;
        activity = '正在重命名…';
        updateStatus();
        const renaming = path;
        try {
          const item = P.fileInfo(await P.renameFile(renaming, nextName));
          if (destroyed || path !== renaming) return;
          path = item?.path || `${renaming.slice(0, renaming.lastIndexOf('/') + 1)}${nextName}`;
          name = item?.name || nextName;
          // A rename can stamp the file anew; its contents are still the ones this PDF knows.
          if (remote) {
            const renamed = item?.modified
              ? item
              : P.canStat() && (await P.statFile(path).catch(() => null));
            if (destroyed) return;
            remote = renamed ? { ...renamed, size: remote.size } : null;
          }
          toast(`已重命名为“${name}”。`);
        } catch (error) {
          if (destroyed) return;
          if (P.isConnectionFailure(error)) throw error;
          const reason = error?.message || error?.error?.message;
          throw new Error(
            /exist/i.test(reason || '') || error?.code === 'item_with_same_name_exists'
              ? `该文件夹中已存在名为“${nextName}”的文件。请选择其他名称。`
              : `文件重命名失败${reason ? `：${reason.replace(/\.$/, '')}` : ''}。`,
          );
        } finally {
          activity = null;
          saving = false;
          if (!destroyed) updateStatus();
        }
        return;
      }
      saveGeneration++;
      name = nextName;
      path = null;
      remote = null;
      session.savedRevision = -1;
      updateStatus();
    }),
    'document-name',
    { title: name },
  );
  const saveStatus = el('span', { class: 'save-status' });
  const protectionBadge = button(
    '受保护',
    'Lock',
    safe(() => (access().owner ? securityDialog() : unlockOwner())),
    'protection-badge',
    { title: '已受保护。更改或删除密码及使用限制。', hidden: true },
  );
  /** A tooltip naming a command and its shortcut, as this platform writes it. */
  const withShortcut = (label, spec) => `${label} (${formatShortcut(spec)})`;
  const saveButton = button(
    '保存到本地',
    'Cloud',
    safe(() => save()),
    'btn primary',
  );
  const undoButton = stepButton(
    '撤销',
    'Undo2',
    safe(() => history('undo')),
    {
      title: withShortcut('撤销', 'Mod+Z'),
    },
  );
  const redoButton = stepButton(
    '重做',
    'Redo2',
    safe(() => history('redo')),
    {
      title: withShortcut('重做', 'Mod+Shift+Z'),
    },
  );
  // Discard a pending object edit before a pointer click can blur its numeric
  // field and turn that draft into an unintended PDF transaction.
  undoButton.addEventListener('pointerdown', (e) => {
    if (e.button === 0 && pageImages.dirty) e.preventDefault();
  });
  let pageInputDirty = false;
  const pageInput = el('input', {
    type: 'number',
    min: 1,
    value: 1,
    class: 'page-input',
    'aria-label': '页码',
    oninput: () => {
      pageInputDirty = true;
    },
    onchange: () => {
      if (pageInputDirty) commitPageInput();
    },
    onkeydown: (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        // Enter is a choice even when the value matches the displayed page: it may
        // supersede a pending navigation. Native change only covers different values.
        e.preventDefault();
        commitPageInput();
      }
    },
    onblur: () => {
      if (pageInputDirty) commitPageInput();
      pageInput.value = String(pageIndex + 1);
    },
  });
  function commitPageInput() {
    pageInputDirty = false;
    // An emptied or unparsable field keeps the current page instead of jumping to page 1.
    const value = Number(pageInput.value);
    if (!pageInput.value.trim() || !Number.isFinite(value)) {
      pageInput.value = String(pageIndex + 1);
      return;
    }
    navigate(value - 1);
  }
  const pageTotal = el('span', { class: 'muted' });
  /** Whether a step button (page, zoom, Undo, Redo) is off, also when kept focusable. */
  const stepOff = (button) => button.disabled || button.getAttribute('aria-disabled') === 'true';
  /**
   * Turn a page, zoom, Undo or Redo button off. One holding the focus (pressed to the end of its
   * range, or while the PDF is busy) stays focusable and is marked unavailable instead, as in an
   * accessible toolbar, so the focus is not dropped onto the page; it turns off fully once the
   * focus moves on.
   */
  function setStepOff(button, off) {
    const held = off && document.activeElement === button;
    button.disabled = off && !held;
    if (held) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
  }
  function stepButton(label, glyph, onClick, attrs) {
    const button = iconButton(label, glyph, (e) => (stepOff(button) ? false : onClick(e)), attrs);
    // A blur from switching windows keeps the button focused, so it stays focusable then.
    button.addEventListener('blur', () => {
      if (document.activeElement !== button && button.getAttribute('aria-disabled') === 'true')
        setStepOff(button, true);
    });
    return button;
  }
  const prevButton = stepButton('上一页', 'ChevronLeft', () => navigateBy(-1));
  const nextButton = stepButton('下一页', 'ChevronRight', () => navigateBy(1));
  /** The steps the zoom buttons, shortcuts, and wheel move through. */
  const ZOOM_LEVELS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
  const zoomSelect = el(
    'select',
    {
      class: 'zoom-select',
      'aria-label': '缩放',
      onchange: safe((e) => setZoom(e.target.value)),
    },
    ...[
      ['fit', '适合宽度'],
      ['page', '适合整页'],
      ['0.5', '50%'],
      ['0.75', '75%'],
      ['1', '100%'],
      ['1.25', '125%'],
      ['1.5', '150%'],
      ['2', '200%'],
      ['3', '300%'],
      ['4', '400%'],
    ].map(([value, label]) => el('option', { value }, label)),
  );
  /** Names a zoom reached with the buttons or the wheel that has no fixed menu entry. */
  const customZoomOption = el('option', { value: '', 'data-custom': 'true' });
  // The status bar keeps its compact line icons; the glass drawings are for commands.
  const zoomOutButton = stepButton(
    '缩小',
    icon('ZoomOut', 18, { plain: true }),
    safe(() => setZoom(zoomStep(-1))),
    { title: withShortcut('缩小', 'Mod+Minus') },
  );
  const zoomInButton = stepButton(
    '放大',
    icon('ZoomIn', 18, { plain: true }),
    safe(() => setZoom(zoomStep(1))),
    { title: withShortcut('放大', 'Mod+Plus') },
  );
  /** The zoom for the current scale mode, from the page's natural size and the workspace. */
  function computeZoom(natural, mode = scaleMode) {
    if (mode === 'fit' && (stack.continuous || stack.twoUp)) natural = stack.widest(natural);
    else if (mode === 'page' && stack.continuous) natural = stack.largest(natural);
    else if (mode === 'page' && stack.twoUp)
      natural = { width: natural.width * 2, height: natural.height };
    const width = workspace.clientWidth,
      height = workspace.clientHeight;
    // Room on both sides for the floating quick tools, so they never cover a fitted page; on
    // phones the tools sit in a row above the page instead.
    const gutter = window.matchMedia('(max-width: 760px)').matches || width < 400 ? 28 : 120;
    // Side by side, the 12px gap between the pages is not zoomed, and each page is sized in
    // whole pixels: an even width keeps two rounded halves from overflowing it.
    const room = stack.twoUp ? 2 * Math.floor((width - gutter - 12) / 2) : width - gutter;
    // A fitted page fits however large it is (a poster, a roll plot): a 15% floor left pages
    // over about 4,000 points wide spilling out of a view that still said Fit width.
    const least = 0.02;
    if (mode === 'fit') return Math.min(1.5, Math.max(least, room / natural.width));
    if (mode === 'page') {
      // The sheet shares the workspace height with its padding and the caption beneath it.
      const vertical = width < 600 ? 70 : 92;
      return Math.max(
        least,
        Math.min(3, room / natural.width, (height - vertical) / natural.height),
      );
    }
    return Number(mode);
  }
  /** Step from the requested zoom, including commands received while an edit settles. */
  function zoomStep(direction) {
    const requested = pendingZoom
      ? computeZoom(viewport.clone({ scale: 1 }), pendingZoom.mode)
      : zoom;
    const levels =
      direction > 0
        ? ZOOM_LEVELS.filter((level) => level > requested * 1.01)
        : ZOOM_LEVELS.filter((level) => level < requested / 1.01).reverse();
    // Past the last step the zoom stays: zooming out of a page fitted below 25% used to jump
    // up to 25%, the opposite way.
    if (levels[0] !== undefined) return String(levels[0]);
    const end = direction > 0 ? ZOOM_LEVELS.at(-1) : ZOOM_LEVELS[0];
    return (direction > 0 ? requested < end : requested > end)
      ? String(end)
      : (pendingZoom?.mode ?? scaleMode);
  }
  /** Show the current scale mode in the menu, adding an entry for an unlisted zoom. */
  function syncZoomSelect() {
    const listed = [...zoomSelect.options].some(
      (option) => !option.dataset.custom && option.value === scaleMode,
    );
    if (listed) customZoomOption.remove();
    else {
      customZoomOption.value = scaleMode;
      customZoomOption.textContent = `${Math.round(Number(scaleMode) * 100)}%`;
      const larger = [...zoomSelect.options].find(
        (option) => !option.dataset.custom && Number(option.value) > Number(scaleMode),
      );
      zoomSelect.insertBefore(customZoomOption, larger || null);
    }
    zoomSelect.value = scaleMode;
  }
  /**
   * Change the zoom while keeping the page point under `anchor` (client coordinates; the
   * middle of the view by default) where it is, so zooming in on a spot keeps it in sight.
   */
  async function setZoom(mode, anchor = null) {
    if (!viewport || destroyed || mode === (pendingZoom?.mode ?? scaleMode)) return;
    // Claim the target before yielding. New commands supersede this request, even when
    // they return to the rendered scale while a draft or document reload is still pending.
    const previous = pendingZoom;
    const request = (pendingZoom = { mode });
    try {
      // A display-only zoom can redraw the current PDF while an isolated edit is saving.
      // Wait only when the renderer is absent, history is queued, or a draft needs saving.
      if (
        !pdf ||
        pendingHistory ||
        textEdit ||
        noteEdit ||
        pageForms.draft.dirty ||
        pageImages.dirty
      )
        await idle();
      if (destroyed || pendingZoom !== request) return;
      // A selected markup or open note stays selected, as a shape does, also when this zoom
      // follows one still drawing the page (which has taken the selection down).
      const held = (request.held = heldSelection() || previous?.held);
      const release = held ? properties.preserveLayout() : () => {};
      let point, fraction;
      try {
        await finishDrafts();
        if (destroyed || pendingZoom !== request) return;
        const view = workspace.getBoundingClientRect();
        point = anchor || { x: view.left + view.width / 2, y: view.top + view.height / 2 };
        const before = paper.getBoundingClientRect();
        fraction = [
          (point.x - before.left) / (before.width || 1),
          (point.y - before.top) / (before.height || 1),
        ];
        scaleMode = mode;
        // The anchor is kept as the page is laid out at the new zoom, in the same frame, rather
        // than once its words and fields are drawn too: a pinch's stretched picture stays until
        // then instead of springing back to the old size first.
        zoomPlacement = () => {
          clearPinchScale();
          const after = paper.getBoundingClientRect();
          workspace.scrollLeft += after.left + fraction[0] * after.width - point.x;
          workspace.scrollTop += after.top + fraction[1] * after.height - point.y;
          stack.quiet();
        };
        await renderPage();
        if (destroyed || pendingZoom !== request || paper.hidden) return;
        await restoreSelection(held);
      } finally {
        release();
      }
      if (destroyed || pendingZoom !== request || paper.hidden) return;
      const after = paper.getBoundingClientRect();
      workspace.scrollLeft += after.left + fraction[0] * after.width - point.x;
      workspace.scrollTop += after.top + fraction[1] * after.height - point.y;
      stack.quiet();
    } catch (error) {
      // A draft that cannot be committed keeps the current zoom, so the control must too.
      if (pendingZoom === request) syncZoomSelect();
      throw error;
    } finally {
      if (pendingZoom === request) pendingZoom = null;
    }
  }
  const thumbnails = el('div', {
    class: 'thumbnails',
    id: 'sidebar-panel-pages',
    role: 'tabpanel',
    'aria-labelledby': 'sidebar-tab-pages',
  });
  // The outline (bookmarks) shares the panel with the pages when the PDF has one.
  const outline = createOutlinePanel({
    onNavigate: (index, target) => {
      if (window.matchMedia('(max-width: 760px)').matches) hideSidebar();
      showDestination(target || { page: index, left: null, top: null });
    },
    onMenu: (entry, e) =>
      openMenu({
        anchor: entry.button,
        x: e.clientX,
        y: e.clientY,
        label: '书签',
        items: [
          {
            permission: 'assemble',
            label: '重命名书签…',
            icon: 'Pencil',
            disabled: busy,
            onSelect: pageDialog(async () => {
              const title = await promptText('重命名书签', '书签名', entry.title);
              if (title == null || destroyed) return;
              await mutate(
                (doc) => renameBookmark(doc, entry.path, title),
                '书签已重命名。',
                'assemble',
              );
            }),
          },
          {
            permission: 'assemble',
            label: '删除书签',
            icon: 'Trash2',
            disabled: busy,
            onSelect: pageAction(() =>
              mutate((doc) => removeBookmark(doc, entry.path), '书签已删除。', 'assemble'),
            ),
          },
        ],
      }),
  });
  outline.el.id = 'sidebar-panel-outline';
  outline.el.setAttribute('role', 'tabpanel');
  outline.el.setAttribute('aria-labelledby', 'sidebar-tab-outline');
  outline.el.hidden = true;
  // Every note and markup in the PDF, listed by page; choosing one opens or selects it.
  let revealComment = null;
  const comments = createCommentsPanel({
    onSelect: safe(async (comment) => {
      if (busy) return;
      // A narrow panel hides first, handing focus to the page that the comment opens on.
      if (window.matchMedia('(max-width: 760px)').matches) hideSidebar();
      const focusFrom = document.activeElement;
      // Saving the selected shared note detaches it from other pages and gives it a
      // new ID. Its position in this page's note list remains the same.
      const noteOrdinal =
        comment.page === pageIndex &&
        comment.reveal === 'note' &&
        noteEdit?.entry?.id === editorAnnotationId(comment.id)
          ? notes.indexOf(noteEdit.entry)
          : -1;
      await navigate(comment.page, {
        id: comment.id,
        // Text boxes, shapes, and other drawn comments are selected in their own layer.
        kind: comment.reveal || 'annotation',
        page: comment.page,
        rect: comment.rect,
        focusFrom,
        noteOrdinal,
      });
    }),
  });
  comments.el.id = 'sidebar-panel-comments';
  comments.el.setAttribute('role', 'tabpanel');
  comments.el.setAttribute('aria-labelledby', 'sidebar-tab-comments');
  comments.el.hidden = true;
  // Files carried in the PDF, with Save and Remove, and a way to attach another.
  const attachments = createAttachmentsPanel({
    canEdit: () => !!access().edit,
    onAdd: safe(() => attachFile()),
    onSave: safe(async (key, fileName) => {
      const pageFile = pageFiles.get(key);
      if (pageFile) {
        const bytes = await pdf.getAttachmentContent(pageFile.fileId);
        if (!bytes) throw new Error('无法读取此附件。');
        return download(bytes, fileName, 'application/octet-stream');
      }
      const doc = await PDFDocument.load(session.bytes, { updateMetadata: false });
      const bytes = attachmentBytes(doc, key);
      if (!bytes) throw new Error('无法读取此附件。');
      download(bytes, fileName, 'application/octet-stream');
    }),
    onRemove: safe(async (key, fileName) => {
      const pageFile = pageFiles.get(key);
      if (pageFile) {
        // A file attached on a page goes with its paperclip comment.
        requireAccess('annotate');
        if (
          !(await confirmAction(
            '删除附件？',
            `从第 ${pageFile.page + 1} 页删除“${fileName}”及其回形针图标？在 PDF 打开期间您可以撤销此操作。`,
            '删除',
          ))
        )
          return;
        return mutate(
          (doc) => deleteAnnotation(doc, pageFile.page, editorAnnotationId(pageFile.id)),
          `“${fileName}”已删除。`,
          'annotate',
        );
      }
      requireAccess('edit');
      if (
        !(await confirmAction(
          '删除附件？',
          `从当前 PDF 中删除“${fileName}”？在 PDF 打开期间您可以撤销此操作。`,
          '删除',
        ))
      )
        return;
      await mutate((doc) => removeAttachment(doc, key) || false, `“${fileName}”已删除。`);
    }),
  });
  // PDF.js lists the document's own attachments; files attached to paperclip comments on the
  // pages are listed after them, labelled with their page, so they can be saved too. Finding
  // those reads every page's comments, so it waits until the panel is open.
  let pageFiles = new Map();
  function loadAttachments(next) {
    const isCurrent = () => !destroyed && pdf === next;
    attachments.load(
      {
        getAttachments: async () => {
          const found = await next.getAttachments().catch(() => null);
          const entries = found instanceof Map ? [...found] : Object.entries(found || {});
          const files = new Map();
          if (sidebarTab === 'attachments') {
            const keys = new Set(entries.map(([key]) => key));
            const annotations = await next
              .getAnnotationsByType(new Set([pdfjs.AnnotationType.FILEATTACHMENT]))
              .catch(() => null);
            for (const a of (annotations || []).sort((x, y) => x.pageIndex - y.pageIndex)) {
              if (!a.fileId || !a.file) continue;
              let key = `page-file:${a.id}`;
              while (keys.has(key)) key += '+';
              keys.add(key);
              files.set(key, { fileId: a.fileId, page: a.pageIndex, id: a.id });
              const where = `第 ${a.pageIndex + 1} 页`;
              entries.push([
                key,
                {
                  filename: a.file.filename,
                  description: a.file.description ? `${where} · ${a.file.description}` : where,
                },
              ]);
            }
          }
          if (isCurrent()) pageFiles = files;
          return new Map(entries);
        },
      },
      { isCurrent },
    );
  }
  attachments.el.id = 'sidebar-panel-attachments';
  attachments.el.setAttribute('role', 'tabpanel');
  attachments.el.setAttribute('aria-labelledby', 'sidebar-tab-attachments');
  attachments.el.hidden = true;
  function attachFile() {
    requireAccess('edit');
    const input = el('input', { type: 'file' });
    input.onchange = safe(async () => {
      const file = input.files?.[0];
      if (!file || destroyed) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      await mutate(
        (doc) => addAttachment(doc, { name: file.name, bytes, mimeType: file.type || undefined }),
        `已附加“${file.name}”。`,
      );
      if (!destroyed) showSidebarTab('attachments');
    });
    input.click();
  }
  // The PDF's layers; switching one changes the view of every page, not the file.
  let documentLayers = null;
  // The reader's own switches, by layer, carried over to the configuration each reload
  // of the PDF (after every edit) starts afresh from the file's defaults.
  const layerChoices = new Map();
  const layers = createLayersPanel({
    onToggle: safe(async (id, visible) => {
      // The choices are made again in order after each edit; the latest goes last, so it
      // wins over earlier ones in the same radio button set.
      layerChoices.delete(id);
      layerChoices.set(id, visible);
      const config = await documentLayers;
      config?.setVisibility(id, visible);
      layers.sync();
      if (destroyed) return;
      await renderPage();
      stack.invalidate();
      renderThumbnails();
    }),
  });
  layers.el.id = 'sidebar-panel-layers';
  layers.el.setAttribute('role', 'tabpanel');
  layers.el.setAttribute('aria-labelledby', 'sidebar-tab-layers');
  layers.el.hidden = true;
  // Certificate signatures: their validity in a panel and in a bar above the pages.
  let signatureReports = [],
    signatureCheck = 0,
    signedEditAccepted = false;
  const digitalIds = []; // IDs opened or created in this tab, offered again when signing
  const signaturesPanel = createSignaturesPanel({
    onGoTo: (report) => navigate(report.page),
    onValidate: safe(() => validateSignatures(true)),
  });
  signaturesPanel.el.id = 'sidebar-panel-signatures';
  signaturesPanel.el.setAttribute('role', 'tabpanel');
  signaturesPanel.el.setAttribute('aria-labelledby', 'sidebar-tab-signatures');
  signaturesPanel.el.hidden = true;
  const signatureBar = createSignatureBar({
    onOpenPanel: safe(async () => {
      showSidebarTab('signatures');
      if (editorRoot.classList.contains('hide-pages')) await toggleSidebar(true);
    }),
  });
  // The accessibility check's report, in its own panel once a check has run.
  const accessibilityReport = createAccessibilityReport({
    onFix: (fix) => safe(() => fixAccessibility(fix))(),
    onGoTo: (page) => navigate(page),
  });
  accessibilityReport.el.id = 'sidebar-panel-accessibility';
  accessibilityReport.el.setAttribute('role', 'tabpanel');
  accessibilityReport.el.setAttribute('aria-labelledby', 'sidebar-tab-accessibility');
  accessibilityReport.el.hidden = true;
  // A file that claims PDF/A says so in a bar above the pages, as desktop editors do.
  const standardsText = el('span', { class: 'signature-bar-text' });
  const standardsBar = el(
    'div',
    { class: 'standards-bar tone-unknown', role: 'status', hidden: true },
    el('span', { class: 'signature-bar-icon', 'aria-hidden': 'true' }, icon('Info', 15)),
    standardsText,
    button('检查合规性', null, () => pageDialog(() => pdfaDialog('check'))(), 'text-btn'),
  );
  /** The bytes signatures cover: an encrypted file's own bytes until it is edited. */
  const signedBytes = () =>
    encryptedOriginal && session.revision === 0 ? encryptedOriginal : session.bytes;
  /**
   * Whether the file holds a signature value. Signature dictionaries are never compressed (their
   * byte ranges point into the file itself), so the key shows up in the raw bytes.
   */
  function hasSignatureValue(bytes) {
    const key = [47, 66, 121, 116, 101, 82, 97, 110, 103, 101]; // "/ByteRange"
    outer: for (let i = bytes.indexOf(47); i !== -1; i = bytes.indexOf(47, i + 1)) {
      for (let k = 1; k < key.length; k++) if (bytes[i + k] !== key[k]) continue outer;
      return true;
    }
    return false;
  }
  async function validateSignatures(announce = false) {
    const token = ++signatureCheck;
    const source = pdf;
    // A file rewritten after it was signed, here or by another program, can keep its
    // signature dictionaries in compressed object streams; its form still says it is signed.
    const raw = hasSignatureValue(signedBytes());
    const flagged =
      !raw &&
      !!source &&
      (await source.getMetadata().then(
        ({ info }) => !!info?.IsSignaturesPresent,
        () => false,
      ));
    if (token !== signatureCheck || destroyed) return;
    let reports = [];
    if (raw || flagged) {
      const { verifySignatures } = await import('./core/digital-signature.js');
      // An encrypted file's text strings (reason, field names) need the password it opened with.
      reports = await verifySignatures(signedBytes(), {
        password: initialProtection?.permissions || initialProtection?.open || '',
      });
      if (token !== signatureCheck || destroyed) return;
    }
    signatureReports = reports;
    signaturesPanel.show(reports);
    signatureBar.show(reports);
    const hasFields = raw || reports.length > 0;
    const tab = sidebarTabs.querySelector('[data-tab="signatures"]');
    tab.hidden = !hasFields;
    if (!hasFields && sidebarTab === 'signatures') showSidebarTab('pages');
    if (announce)
      toast(
        reports.length
          ? `已检查 ${reports.length} 个数字证书签名。`
          : '此 PDF 没有数字证书签名。',
      );
  }
  /** Editing a signed PDF rewrites it, which invalidates its signatures; ask once first. */
  async function confirmSignedEdit() {
    if (signedEditAccepted || !signatureReports.some((report) => report.byteRange)) return true;
    const count = signatureReports.length;
    const ok = await confirmAction(
      '编辑已签名的 PDF？',
      `此 PDF 包含 ${count} 个数字证书签名。在此编辑将保存该文件的新副本，其中的所有签名将显示为无效。如果文档需要有效签名，请在编辑完成后重新签名。`,
      '仍然编辑',
    );
    if (ok) signedEditAccepted = true;
    return ok;
  }
  let sidebarTab = 'pages';
  // The panel is narrow: the tabs are icons and the heading names the one that is open.
  const SIDEBAR_TABS = [
    ['pages', '页面', 'LayoutGrid'],
    ['outline', '大纲', 'ListTree'],
    ['comments', '批注', 'MessageSquareText'],
    ['attachments', '附件', 'Paperclip'],
    ['layers', '图层', 'Layers'],
    ['signatures', '签名', 'signatures'],
    ['accessibility', '无障碍检查', 'Accessibility'],
  ];
  const sidebarTitle = el('h2', {}, '页面');
  const commentsBadge = el('span', { class: 'tab-count', hidden: true });
  const visibleTabs = () =>
    [...sidebarTabs.querySelectorAll('[role="tab"]')].filter((tab) => !tab.hidden);
  const sidebarTabs = el(
    'div',
    {
      class: 'sidebar-tabs',
      role: 'tablist',
      'aria-label': '侧边栏面板',
      'aria-orientation': 'vertical',
    },
    ...SIDEBAR_TABS.map(([id, label, glyph]) =>
      el(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: 'sidebar-tab',
          id: `sidebar-tab-${id}`,
          'data-tab': id,
          'aria-label': label,
          title: label,
          'aria-selected': String(id === sidebarTab),
          'aria-controls': `sidebar-panel-${id}`,
          tabindex: id === sidebarTab ? 0 : -1,
          // A tab in the rail opens its panel; the panel's own Close button hides it again.
          onclick: safe(async () => {
            showSidebarTab(id);
            if (editorRoot.classList.contains('hide-pages')) await toggleSidebar(true);
          }),
          // Up/Down (and Left/Right) step through the tabs, Home and End jump to the ends, as
          // the tabs pattern expects; the panel follows the focused tab.
          onkeydown: (e) => {
            const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
            if (!keys.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
            // Home and End belong to the tabs, not to the document's first and last page.
            e.preventDefault();
            e.stopPropagation();
            const tabs = visibleTabs(),
              at = tabs.findIndex((tab) => tab.dataset.tab === id);
            const next =
              e.key === 'Home'
                ? tabs[0]
                : e.key === 'End'
                  ? tabs.at(-1)
                  : tabs[
                      (at +
                        (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) +
                        tabs.length) %
                        tabs.length
                    ];
            if (!next) return;
            showSidebarTab(next.dataset.tab);
            next.focus();
          },
        },
        icon(glyph, 16),
        id === 'comments' ? commentsBadge : null,
      ),
    ),
  );
  function showSidebarTab(id) {
    sidebarTab = id;
    thumbnails.hidden = id !== 'pages';
    outline.el.hidden = id !== 'outline';
    comments.el.hidden = id !== 'comments';
    attachments.el.hidden = id !== 'attachments';
    layers.el.hidden = id !== 'layers';
    signaturesPanel.el.hidden = id !== 'signatures';
    accessibilityReport.el.hidden = id !== 'accessibility';
    const title = SIDEBAR_TABS.find(([tab]) => tab === id)[1];
    sidebarTitle.textContent = title;
    // One landmark holds all three panels, so its name follows the tab that is open.
    sidebar.setAttribute('aria-label', `${title}面板`);
    const close = `关闭${title}面板`;
    sidebarClose.setAttribute('aria-label', close);
    sidebarClose.title = close;
    sidebarTabs.querySelectorAll('[role="tab"]').forEach((tab) => {
      const on = tab.dataset.tab === id;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    });
    if (id === 'pages') revealThumbnail();
    else if (id === 'attachments' && pdf) loadAttachments(pdf);
    else if (id === 'outline') outline.setCurrent(pageIndex, { reveal: true });
  }
  // PDF.js names annotations "12R"; the editors use pdf-lib's "12 0 R".
  function editorAnnotationId(id) {
    const m = /^(\d+)R(\d*)$/.exec(id);
    return m ? `${m[1]} ${m[2] || 0} R` : id;
  }
  /** Open the note or select the markup a comment points to, once its page is rendered. */
  async function applyRevealComment() {
    const pending = revealComment;
    revealComment = null;
    if (!pending || pending.page !== pageIndex || tool !== 'select') return;
    await selectComment(pending);
    // The page opens at its top, or stays where it was scrolled; the comment itself can be
    // further down, or out to the side at a high zoom.
    if (pending.rect && !destroyed && pageIndex === pending.page && viewport) {
      const [x1, y1] = viewport.convertToViewportPoint(pending.rect[0], pending.rect[1]);
      const [x2, y2] = viewport.convertToViewportPoint(pending.rect[2], pending.rect[3]);
      const sheet = paper.getBoundingClientRect();
      revealBox({
        left: sheet.left + Math.min(x1, x2),
        right: sheet.left + Math.max(x1, x2),
        top: sheet.top + Math.min(y1, y2),
        bottom: sheet.top + Math.max(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      });
      stack.quiet();
    }
  }
  async function selectComment(pending) {
    const id = editorAnnotationId(pending.id);
    if (pending.kind === 'annotation') return annotationLayer.focus(id);
    const entry =
      pending.kind === 'note'
        ? notes.find((note) => note.id === id) || notes[pending.noteOrdinal]
        : highlights.find((highlight) => highlight.id === id);
    // A read-only markup has no edit controls on its page, so it is shown there, not selected.
    if (!entry || (pending.kind !== 'note' && entry.readOnly)) return;
    // Navigation or an earlier draft can take time. Keep a newer focus choice while
    // still selecting the requested comment. A draft may focus the overlay or rebuild
    // the comments list, restoring focus to the same comment's replacement button.
    const canFocus = () => {
      const active = document.activeElement;
      return (
        active === document.body ||
        active === overlay ||
        active === pending.focusFrom ||
        (comments.el.contains(active) &&
          editorAnnotationId(active.dataset.commentId || '') === entry.id &&
          active.dataset.commentPage === String(pending.page))
      );
    };
    if (pending.kind === 'note') {
      await openNoteEditor({ entry, canFocus });
    } else {
      pageImages.close();
      annotationLayer.clear();
      selectedHighlight = entry;
      renderHighlightTargets();
      if (canFocus())
        properties.root
          .querySelector('.highlight-edit-panel input')
          ?.focus({ preventScroll: true });
    }
  }
  // The navigation panels open beside the right-hand rail, as in desktop PDF editors.
  const sidebarClose = iconButton('关闭页面面板', 'X', () => toggleSidebar(false));
  const sidebar = el(
    'aside',
    { id: 'page-sidebar', class: 'page-sidebar', 'aria-label': '页面面板' },
    el('div', { class: 'sidebar-head' }, sidebarTitle, sidebarClose),
    thumbnails,
    outline.el,
    comments.el,
    attachments.el,
    layers.el,
    signaturesPanel.el,
    accessibilityReport.el,
  );
  const canvas = el('canvas', { 'aria-hidden': 'true' });
  const textContainer = el('div', { class: 'textLayer' });
  const overlay = el('canvas', {
    class: 'drawing-overlay',
    tabindex: '0',
    'aria-label': 'PDF 批注区域。使用“放置在页面中心”进行键盘批注。',
  });
  const textTargets = el('div', { class: 'text-targets', hidden: true });
  const highlightTargets = el('div', { class: 'highlight-targets' });
  const noteTargets = el('div', { class: 'note-targets' });
  // Links found on the page, as PDF.js reports them, shown as anchors in Select.
  const linkTargets = el('div', { class: 'link-targets' });
  let links = [];
  // The area drawn in crop mode stays until it is applied, redrawn, or dropped.
  let cropDraft = null;
  const pageForms = createFormLayer({
    onChange: () => updateStatus(),
    onCommit: safe(() => finishDrafts()),
    onTabOut: (direction) => tabToFormPage(direction),
  });
  // The pages with fields to fill, read from the PDF once the fields are first used.
  const fillablePages = new WeakMap();
  pageForms.root.addEventListener('focusin', () => {
    const source = pdf;
    if (!source || fillablePages.has(source)) return;
    fillablePages.set(source, null);
    const types = new Set(['text', 'checkbox', 'radiobutton', 'combobox', 'listbox']);
    source.getFieldObjects().then(
      (fields) =>
        fillablePages.set(
          source,
          new Set(
            [...(fields?.values() ?? [])]
              .flat()
              .filter((w) => types.has(w?.type) && w.editable && !w.hidden && w.page >= 0)
              .map((w) => w.page),
          ),
        ),
      () => {},
    );
  });
  /** Tab past the page's last field (or before its first) goes on to the next page's fields. */
  function tabToFormPage(direction) {
    const pages = pdf && !busy ? fillablePages.get(pdf) : null;
    if (!pages) return false;
    const [target] = [...pages]
      .filter((page) => (page - pageIndex) * direction > 0)
      .sort((a, b) => (a - b) * direction);
    if (target === undefined) return false;
    safe(async () => {
      if (await navigate(target)) pageForms.focusEdge(direction < 0);
    })();
    return true;
  }
  const properties = createPropertiesPanel();
  // Comments drawn as annotations, selectable in Select.
  const annotationLayer = createAnnotationLayer({
    onSelect: (entry, { refresh = false } = {}) => {
      if (!entry || refresh) return showAnnotationProperties(entry);
      // Choosing a comment finishes drafts and lets go of a picture, shape, or markup, as
      // choosing any other object does. A draft that cannot be saved keeps the selection.
      safe(() =>
        selectionProperties(async () => {
          cancelTextSelection();
          try {
            await finishDrafts();
          } catch (error) {
            annotationLayer.clear();
            throw error;
          }
          pageImages.close();
          if (selectedHighlight) {
            selectedHighlight = null;
            renderHighlightTargets();
          }
          const chosen = annotationLayer.selected;
          if (chosen) showAnnotationProperties(chosen);
        }),
      )();
    },
    // Pressing the comment saves its Comment field first; the move or deletion waits for that.
    onMove: (entry, rect) =>
      safe(async () => {
        await annotationTextDraft?.();
        const move = (doc) => editAnnotation(doc, pageIndex, entry.id, { rect });
        await mutate(move, null, 'annotate', { retainScale: true });
      })(),
    onDelete: (entry) => {
      // Without permission to comment, the Delete button is disabled; the key matches it.
      if (access().annotate)
        safe(async () => {
          await annotationTextDraft?.();
          await removeAnnotation(entry);
        })();
    },
  });
  // Prepare a form: the fields of the page as boxes to place, move, size, and open.
  let preparing = false,
    fieldType = 'text',
    formFields = [];
  const designer = createFormDesigner({
    onMove: (field, rect) =>
      safe(() =>
        formDesignEdit(
          async (doc) =>
            (await loadForms()).moveFormWidget(doc, field.name, field.widgetIndex, rect),
          null,
          'edit',
          {
            retainScale: true,
          },
        ),
      )(),
    onOpen: (field) => pageDialog(() => fieldPropertiesDialog(field))(),
    onDelete: (field) => safe(() => removeFormField(field))(),
  });
  function canFocusSelection(previous) {
    const active = document.activeElement;
    return active === document.body || active === overlay || active === previous;
  }
  function preserveSelectionLayout() {
    const release = properties.preserveLayout();
    return () => {
      release();
      syncStyleButtons();
      refitPage();
    };
  }
  async function selectionProperties(action) {
    const release = preserveSelectionLayout();
    try {
      return await action();
    } finally {
      release();
    }
  }
  const pageImages = createImageLayer({
    beginSelection: preserveSelectionLayout,
    canFocusSelection,
    onProperties: (panel, title) =>
      panel ? properties.show('object', title, panel) : properties.clear('object'),
    beforeSelect: async () => {
      cancelTextSelection();
      // A chosen picture or shape lets go of a selected comment, as other objects do.
      annotationLayer.clear();
      await finishDrafts(true);
      selectedHighlight = null;
      renderHighlightTargets();
    },
    onChange: () => updateStatus(),
    onCommit: async (entry, change) => {
      await mutate(
        (doc) =>
          change.replacement
            ? replaceImage(doc, pageIndex, entry, change.replacement, change.transform)
            : (entry.kind && entry.kind !== 'image' ? editPath : editImage)(
                doc,
                pageIndex,
                entry,
                change,
              ),
        null,
        'edit',
        { retainScale: !change.remove },
      );
      // The deleted object's handle or Delete button held the focus; keep it on the page, as
      // deleting text or a comment does.
      if (change.remove && !destroyed && document.activeElement === document.body)
        overlay.focus({ preventScroll: true });
    },
    preparePreview: prepareImagePreview,
  });
  // Hidden until the first page has its size: an unsized canvas would show as a small blank
  // rectangle while the document loads.
  const paper = el(
    'div',
    { class: 'paper', hidden: true },
    canvas,
    pageImages.preview,
    pageImages.targets,
    textContainer,
    overlay,
    textTargets,
    linkTargets,
    highlightTargets,
    noteTargets,
    annotationLayer.root,
    pageForms.root,
    designer.root,
    pageImages.controls,
  );
  const pageCaption = el('div', { class: 'page-caption' });
  const pageStackElement = el('div', { class: 'paper-wrap page-stack' }, paper, pageCaption);
  const workspace = el(
    'div',
    { class: 'workspace', role: 'region', tabindex: '0', 'aria-label': 'PDF 页面视图' },
    pageStackElement,
  );
  // Every page in one scrolling column; the page being worked on holds the editing layers.
  const stack = createPageStack({
    workspace,
    container: pageStackElement,
    getPdf: () => pdf,
    getZoom: () => zoom,
    getRevision: () => session.revision,
    getLayers: () => documentLayers || undefined,
    currentIndex: () => pageIndex,
    canFollowScroll: () =>
      !busy &&
      !destroyed &&
      pageReady &&
      !pendingNavigation &&
      !textEdit &&
      !textPointer &&
      !noteEdit &&
      !gesture &&
      !cropDraft &&
      !selectedHighlight &&
      !pageImages.active &&
      !pageImages.dirty &&
      !pageImages.selected &&
      !pageForms.draft.dirty &&
      !paper.contains(document.activeElement),
    onScrollPage: (index) => navigate(index, null, { scroll: false }),
  });
  // Organize pages: a grid of every page that stands in for the document while it is open.
  // Its commands report their own failures, as the menus' commands do.
  const organizeActions = {
    rotate: safe((indices, delta) =>
      mutate((doc) => rotatePages(doc, indices, delta), null, 'assemble'),
    ),
    remove: safe((indices) => deletePages(indices)),
    extract: safe((indices) => extractToDownload(indices)),
    duplicate: safe((indices) =>
      mutate(
        async (doc) => {
          await duplicatePages(doc, indices);
          for (const i of new Set(indices)) if (i < pageIndex) pageIndex++;
        },
        indices.length === 1 ? '页面已复制。' : `已复制 ${indices.length} 页。`,
        'assemble',
      ),
    ),
    insertBlank: safe((after) =>
      mutate(
        (doc) => {
          insertBlankPage(doc, after);
          if (after < pageIndex) pageIndex++;
        },
        '已插入空白页。',
        'assemble',
      ),
    ),
    insertFile: (after) => pageDialog((version) => mergeDialog(after, version))(),
    insertPictures: (after) => pageAction(() => insertPicturePages(after))(),
    move: safe((indices, to) => movePages(indices, to)),
    reorder: safe((order, moved) => reorderTo(order, moved)),
    open: (index) => {
      closeOrganizer();
      navigate(index);
    },
    close: () => closeOrganizer(),
  };
  const organizer = createOrganizeView({
    getPdf: () => pdf,
    getRevision: () => session.revision,
    getLayers: () => documentLayers || undefined,
    currentIndex: () => pageIndex,
    can: (permission) => !!access()[permission],
    isBusy: () => busy,
    actions: organizeActions,
    // The tools pane's Organize commands name and act on the pages chosen in the grid.
    onSelectionChange: () => {
      if (toolsPanel.current === 'organize') toolsPanel.refresh();
    },
  });
  function openOrganizer() {
    if (!pdf) return;
    safe(async () => {
      await finishDrafts();
      // Compare files fills the same place; the grid would open hidden underneath it.
      closeComparison();
      editorRoot.classList.add('organizing');
      organizer.show();
    })();
  }
  function closeOrganizer() {
    if (!organizer.visible) return;
    const hadFocus = organizer.root.contains(document.activeElement);
    organizer.hide();
    editorRoot.classList.remove('organizing');
    if (toolsPanel.current === 'organize') toolsPanel.showAll();
    stack.scrollTo(pageIndex);
    stack.refresh();
    if (hadFocus) workspace.focus({ preventScroll: true });
    setTimeout(refitPage, 0);
  }
  // A press on another page makes it the current page before anything is done there.
  pageStackElement.addEventListener(
    'pointerdown',
    (e) => {
      const slot = e.target.closest?.('.page-slot');
      if (!slot || slot.contains(paper) || busy) return;
      const index = Number(slot.dataset.page);
      if (Number.isInteger(index) && index !== pageIndex) navigate(index, null, { scroll: false });
    },
    true,
  );
  const accessibleText = el('div', { class: 'sr-only', role: 'region', 'aria-label': '页面文本' });
  // A touch screen is tapped, not clicked (a double tap edits text as a double click does), so
  // the hints use its words there.
  const touchScreen = window.matchMedia?.('(hover: none) and (pointer: coarse)');
  // While preparing a form, Select shows the fields as boxes to move and open.
  const selectHint = () =>
    preparing
      ? '选择表单域类型以添加表单域。拖动表单域进行移动；双击可打开其属性。'
      : (touchScreen?.matches ? '轻触选中，拖动移动，双击文本进行编辑。' : '单击选中，拖动移动，双击文本进行编辑。');
  const forPointer = (text) =>
    touchScreen?.matches
      ? text
          .replace(/double-click/g, 'double-tap')
          .replace(/\bClick\b/g, 'Tap')
          .replace(/\bclick\b/g, 'tap')
      : text;
  const hint = el(
    'span',
    { class: 'tool-hint' },
    touchScreen?.matches ? '轻触选中，拖动移动，双击文本进行编辑。' : '单击选中，拖动移动，双击文本进行编辑。',
  );
  const colorInput = el('input', {
    type: 'color',
    value: color,
    'aria-label': '批注颜色',
    oninput: (e) => {
      color = e.target.value;
      toolColors[colorGroup()] = color;
      if (textEdit) {
        textEdit.hex = color;
        layoutTextEdit();
        updateStatus();
      }
    },
  });
  const widthInput = el(
    'select',
    {
      'aria-label': '描边粗细',
      onchange: (e) => {
        stroke = Number(e.target.value);
      },
    },
    ...[1, 2, 4, 8].map((n) => el('option', { value: n, selected: n === 2 }, `${n} pt`)),
  );
  const sizeInput = el(
    'select',
    {
      'aria-label': '文字大小',
      onchange: (e) => {
        // Text comments keep their own size; the Text tool keeps its own.
        if (['textbox', 'callout'].includes(tool)) {
          commentSize = Number(e.target.value);
          return;
        }
        textSize = Number(e.target.value);
        if (textEdit) {
          textEdit.size = textSize / textEdit.physicalScale;
          layoutTextEdit();
          updateStatus();
        }
      },
    },
    ...[10, 12, 16, 20, 24, 32, 48].map((n) =>
      el('option', { value: n, selected: n === 16 }, `${n} pt`),
    ),
  );
  // PDF.js reports a face's weight and slant when the descriptor says so; the name is a
  // second witness, since embedded subsets often carry it in their base font name only.
  const isBoldRun = (run) =>
    /bold|[6-9]00/.test(String(run.fontWeight ?? '')) ||
    /bold|black|heavy|semibold/i.test(run.fontName || '');
  const isItalicRun = (run) =>
    run.fontStyle === 'italic' || /italic|oblique/i.test(run.fontName || '');
  const runStyle = (run, check) => {
    const parts = (run.parts || [run]).filter((part) => part.text);
    return parts.every(check) ? true : parts.some(check) ? null : false;
  };
  const decorationChanged = (edit) =>
    edit.underline !== Boolean(edit.run?.underline) ||
    edit.strikethrough !== Boolean(edit.run?.strikethrough);
  /** Whether a draft's bold or italic differs from what its text had. */
  const styleChanged = (edit) =>
    edit.run
      ? edit.bold !== edit.original.bold || edit.italic !== edit.original.italic
      : edit.bold || edit.italic;
  /** The face a draft is previewed and measured with; the text's own unless the style changed. */
  function draftFace(edit, run = edit.run) {
    const bold = edit.run && edit.bold === edit.original.bold ? isBoldRun(run) : edit.bold;
    const italic =
      edit.run && edit.italic === edit.original.italic ? isItalicRun(run) : edit.italic;
    const cjk = cjkDraftFace(
      run,
      edit.input.value,
      !edit.run || styleChanged(edit) ? textVariant(bold, italic) : undefined,
    );
    if (cjk) return cjk;
    if (edit.run && !styleChanged(edit))
      return {
        weight: edit.run?.fontWeight || 'normal',
        style: edit.run?.fontStyle || 'normal',
        family: edit.run?.fontFamily || null,
        ligatures: edit.run?.fontVariantLigatures || 'normal',
      };
    return {
      weight: bold ? 'bold' : 'normal',
      style: italic ? 'italic' : 'normal',
      family: "'Noto Sans Styled'",
      ligatures: 'normal',
    };
  }
  /**
   * Load the CJK faces a draft previews in: only the weights its parts are drawn with, as
   * loading both doubled what typing Chinese, Japanese, or Korean downloads.
   */
  function loadDraftCjkFaces(edit) {
    const text = edit.input.value;
    const weights = new Set(
      (edit.run?.parts || [edit.run]).map((run) => {
        const { weight } = draftFace(edit, run || null);
        return weight === 'bold' || Number(weight) >= 600 ? 'bold' : 'regular';
      }),
    );
    return Promise.all([...weights].map((weight) => ensureStyledFontFaces(weight, text)));
  }
  function applyDraftStyle(edit) {
    if (hasCjkText(edit.input.value))
      loadDraftCjkFaces(edit).then(() => {
        if (textEdit === edit) layoutTextEdit();
      });
    const face = draftFace(edit);
    if (!edit.run || styleChanged(edit))
      Promise.all(
        (edit.run?.parts || [edit.run]).map((run) => {
          const face = draftFace(edit, run);
          return ensureStyledFontFaces(
            textVariant(face.weight === 'bold', face.style === 'italic'),
            edit.input.value,
          );
        }),
      ).then(() => {
        if (textEdit === edit) layoutTextEdit();
      });
    Object.assign(edit.input.style, {
      fontWeight: face.weight,
      fontStyle: face.style,
      fontVariantLigatures: face.ligatures,
      fontFamily: face.family ? `${face.family}, sans-serif` : 'Noto Sans, sans-serif',
    });
  }
  function syncStyleButtons() {
    // A selection handoff must not briefly hide and reopen the text toolbar;
    // even a one-pixel height change can clamp a workspace scrolled to the bottom.
    if (properties.switching && !textEdit) return;
    const edit = textEdit;
    boldButton.setAttribute(
      'aria-pressed',
      edit?.bold === null ? 'mixed' : String(edit ? edit.bold : textBold),
    );
    italicButton.setAttribute(
      'aria-pressed',
      edit?.italic === null ? 'mixed' : String(edit ? edit.italic : textItalic),
    );
    underlineButton.setAttribute('aria-pressed', String(edit ? edit.underline : textUnderline));
    strikethroughButton.setAttribute(
      'aria-pressed',
      String(edit ? edit.strikethrough : textStrikethrough),
    );
    const textOptions = tool === 'text' || !!edit;
    boldButton.hidden =
      italicButton.hidden =
      underlineButton.hidden =
      strikethroughButton.hidden =
        !textOptions;
    // Text boxes and callouts take a size too; drawings and shapes, comments too, a width.
    sizeInput.hidden = !textOptions && !['textbox', 'callout'].includes(tool);
    widthInput.hidden = !['shape', 'ink', 'cshape', 'pencil'].includes(tool);
    toolOptions.hidden = (tool === 'select' || tool === 'hand') && !edit;
    centerButton.hidden = !!edit || UNPLACEABLE.includes(tool);
    if (tool === 'select') colorInput.hidden = !edit;
  }
  function toggleTextStyle(key) {
    if (textEdit) textEdit[key] = !textEdit[key];
    // New text remembers the style for the next draft; an edited line keeps its own.
    if (!textEdit?.run) {
      if (key === 'bold') textBold = textEdit ? textEdit.bold : !textBold;
      else if (key === 'italic') textItalic = textEdit ? textEdit.italic : !textItalic;
      else if (key === 'underline') textUnderline = textEdit ? textEdit.underline : !textUnderline;
      else textStrikethrough = textEdit ? textEdit.strikethrough : !textStrikethrough;
    }
    syncStyleButtons();
    if (textEdit) {
      applyDraftStyle(textEdit);
      layoutTextEdit();
      updateStatus();
    }
  }
  const boldButton = iconButton('加粗', 'Bold', () => toggleTextStyle('bold'), {
    class: 'icon-btn style-toggle',
    'aria-pressed': 'false',
    hidden: true,
  });
  const italicButton = iconButton('斜体', 'Italic', () => toggleTextStyle('italic'), {
    class: 'icon-btn style-toggle',
    'aria-pressed': 'false',
    hidden: true,
  });
  const underlineButton = iconButton('下划线', 'Underline', () => toggleTextStyle('underline'), {
    class: 'icon-btn style-toggle',
    'aria-pressed': 'false',
    hidden: true,
  });
  const strikethroughButton = iconButton(
    '删除线',
    'Strikethrough',
    () => toggleTextStyle('strikethrough'),
    {
      class: 'icon-btn style-toggle',
      'aria-pressed': 'false',
      hidden: true,
    },
  );
  const SHAPE_HINTS = {
    rectangle: '拖动绘制矩形。按住 Shift 绘制正方形。',
    ellipse: '拖动绘制椭圆。按住 Shift 绘制正圆形。',
    line: '拖动绘制线条。按住 Shift 吸附到 45 度角。',
    arrow: '从箭尾拖动到箭头。按住 Shift 吸附到 45 度角。',
    check: forPointer(
      '点击放置勾选标记，或拖动调整大小。按住 Shift 保持正方形。',
    ),
    cross: forPointer('点击放置叉号，或拖动调整大小。按住 Shift 保持正方形。'),
  };
  /** Marks placed with a click, in points. */
  const MARK_SIZE = 14;
  const shapeSelect = el(
    'select',
    {
      'aria-label': '形状类型',
      hidden: true,
      onchange: () => {
        gesture = null;
        clearOverlay();
        if (tool === 'shape') hint.textContent = SHAPE_HINTS[shapeSelect.value];
      },
    },
    el('option', { value: 'rectangle' }, '矩形'),
    el('option', { value: 'ellipse' }, '椭圆'),
    el('option', { value: 'line' }, '直线'),
    el('option', { value: 'arrow' }, '箭头'),
    el('option', { value: 'check' }, '勾选标记'),
    el('option', { value: 'cross' }, '叉号'),
  );
  const centerButton = button(
    '放置于页面中心',
    'Plus',
    safe(() => placeCentered()),
    'text-btn',
  );
  const cropMarginsButton = button(
    '边距…',
    'Crop',
    safe(() => cropDialog()),
    'text-btn',
    {
      hidden: true,
    },
  );
  const cropDoneButton = button(
    '完成',
    'Check',
    safe(() => setTool('select')),
    'text-btn',
    {
      hidden: true,
    },
  );
  const highlightMode = el(
    'select',
    {
      'aria-label': '高亮模式',
      hidden: true,
      onchange: () => {
        gesture = null;
        clearOverlay();
        updateHighlightMode();
      },
    },
    el('option', { value: 'text' }, '文本'),
    el('option', { value: 'area' }, '区域'),
  );
  const highlightArea = () => highlightMode.value === 'area';
  const commentShape = el(
    'select',
    { 'aria-label': '批注形状', hidden: true },
    el('option', { value: 'square' }, '矩形'),
    el('option', { value: 'circle' }, '椭圆'),
    el('option', { value: 'line' }, '直线'),
    el('option', { value: 'arrow' }, '箭头'),
    el('option', { value: 'cloud' }, '云朵'),
  );
  // Measuring: a distance, a perimeter, or an area, in the units of a drawing scale.
  const measureScale = { unit: 'in', ratio: 1 };
  let measurePath = []; // points clicked so far for a perimeter or an area, in PDF space
  const measureMode = el(
    'select',
    {
      'aria-label': '测量模式',
      hidden: true,
      onchange: () => {
        measurePath = [];
        clearOverlay();
        hint.textContent = measureHint();
      },
    },
    el('option', { value: 'distance' }, '距离'),
    el('option', { value: 'perimeter' }, '周长'),
    el('option', { value: 'area' }, '面积'),
  );
  const measureUnit = el(
    'select',
    {
      'aria-label': '测量单位',
      hidden: true,
      onchange: () => (measureScale.unit = measureUnit.value),
    },
    ...Object.entries(MEASURE_UNITS).map(([key, unit]) =>
      el('option', { value: key, selected: key === measureScale.unit }, unit.label),
    ),
  );
  const measureRatio = el('input', {
    type: 'number',
    class: 'input measure-ratio',
    min: 0.0001,
    step: 'any',
    value: 1,
    hidden: true,
    'aria-label': '比例：1 个页面单位代表',
    title: '比例：页面上的 1 个单位代表的实际单位数量',
    onchange: () => {
      const value = Number(measureRatio.value);
      if (value > 0) measureScale.ratio = value;
      else measureRatio.value = measureScale.ratio;
    },
  });
  const measureHint = () =>
    measureMode.value === 'distance'
      ? '拖动以测量距离。'
      : forPointer(
          `点击${measureMode.value === 'area' ? '区域' : '路径'}的每个角；双击或按回车完成，按 Escape 重新开始。`,
        );
  // Text markup: a highlight, an underline, or a strikethrough, each with its usual color.
  const MARKUP_COLORS = { highlight: '#f2c438', underline: '#2d9d5c', strikeout: '#dc3c3c' };
  const markupKind = el(
    'select',
    {
      'aria-label': '标记类型',
      hidden: true,
      onchange: () => {
        color = toolColors.highlight = MARKUP_COLORS[markupKind.value];
        colorInput.value = color;
        labelMarkupButton();
        updateHighlightMode();
        toolsPanel.refresh();
      },
    },
    el('option', { value: 'highlight' }, '高亮'),
    el('option', { value: 'underline' }, '下划线'),
    el('option', { value: 'strikeout' }, '删除线'),
    el('option', { value: 'redact', hidden: true }, '涂黑密文'),
  );
  function labelMarkupButton() {
    const label = {
      highlight: '高亮选中内容',
      underline: '为选中内容加下划线',
      strikeout: '为选中内容加删除线',
      redact: '标记选中内容以密文',
    }[markupKind.value];
    highlightButton.querySelector('span').textContent = label;
    highlightButton.setAttribute('aria-label', label);
    highlightButton.title = label;
  }
  /** Choose the markup tool and its kind, as the comment tools do. */
  async function setMarkup(kind) {
    if (markupKind.value !== kind) {
      markupKind.value = kind;
      toolColors.highlight = MARKUP_COLORS[kind] || '#ff0000';
      labelMarkupButton();
    }
    await setTool('highlight');
  }
  // Redaction marks share the markup tool's text and area selection, and mark instead of
  // highlighting. These settings are what new marks look like once applied.
  const redactionStyle = { fill: '#000000', overlayText: '', repeat: false };
  const redacting = () => tool === 'highlight' && markupKind.value === 'redact';
  let redactionMarks = [];
  const markNumber = (mark) => {
    const onPage = redactionMarks.filter((other) => other.page === mark.page);
    return onPage.length > 1 ? ` ${onPage.indexOf(mark) + 1}` : '';
  };
  /** The marks waiting to be applied, read while the Redact tool is open. */
  async function refreshRedactionMarks() {
    if (toolsPanel.current !== 'redact' || !pdf) return;
    const doc = await loadPdfDocument(session.bytes, { updateMetadata: false });
    if (destroyed) return;
    redactionMarks = (await loadRedaction()).listRedactionMarks(doc);
    toolsPanel.refresh();
  }
  const highlightButton = button(
    '高亮选中内容',
    'Highlighter',
    safe(() => applyHighlight()),
    'text-btn',
    { hidden: true, disabled: true },
  );
  // Toolbar clicks must retain the browser selection until its PDF coordinates are read.
  highlightButton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (highlightCaptureTimer) measureHighlightSelection();
  });
  const toolOptions = el(
    'div',
    { class: 'tool-options', hidden: true },
    colorInput,
    widthInput,
    sizeInput,
    boldButton,
    italicButton,
    underlineButton,
    strikethroughButton,
    shapeSelect,
    commentShape,
    measureMode,
    measureUnit,
    measureRatio,
    markupKind,
    highlightMode,
    highlightButton,
    centerButton,
    cropMarginsButton,
    cropDoneButton,
  );
  const toolButtons = new Map();
  const toolDefs = [
    ['select', '选择', 'MousePointer2'],
    ['hand', '平移', 'Hand'],
    ['text', '文本', 'Type'],
    ['highlight', '高亮', 'Highlighter'],
    ['ink', '绘制', 'Pencil'],
    ['shape', '形状', 'Square'],
    ['note', '便签', 'StickyNote'],
  ];
  const toolGroup = el(
    'div',
    { class: 'tool-group', role: 'group', 'aria-label': '批注工具' },
    ...toolDefs.map(([id, label, glyph]) => {
      const b = button(
        label,
        glyph,
        safe(() => setTool(id)),
        'tool-btn',
        {
          'aria-pressed': id === tool,
          'data-permission': toolPermission(id),
          'data-tool': id,
        },
      );
      toolButtons.set(id, b);
      return b;
    }),
  );
  // The find box is a combobox: the tools its words match are offered in a list beneath it.
  const searchInput = el('input', {
    type: 'search',
    class: 'input',
    placeholder: '查找文本或工具',
    'aria-label': '在 PDF 中查找',
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': 'find-tool-list',
  });
  const searchCount = el('span', { class: 'search-count', role: 'status' });
  let searchTimer;
  searchInput.addEventListener('input', () => {
    scheduleSearch(250, true);
    suggestTools();
  });
  // Typing a tool's name in the find box offers the tool too, beside the matches in the PDF.
  const toolList = el('div', {
    id: 'find-tool-list',
    role: 'listbox',
    'aria-label': '匹配的工具',
  });
  const toolSuggestions = el(
    'div',
    { class: 'find-tool-suggestions', hidden: true },
    el('div', { class: 'find-tool-heading', 'aria-hidden': 'true' }, '工具'),
    toolList,
  );
  const suggestedTools = () => [...toolList.querySelectorAll('[role="option"]')];
  /** Show the suggestions, or hide them, and say so on the find box. */
  function showToolSuggestions(shown) {
    toolSuggestions.hidden = !shown;
    searchInput.setAttribute('aria-expanded', String(shown));
    if (!shown) activateToolOption(-1);
  }
  /** Mark the suggestion at `index` (none for -1) as the one Enter opens. */
  function activateToolOption(index) {
    const options = suggestedTools();
    options.forEach((option, i) => {
      option.setAttribute('aria-selected', String(i === index));
      option.classList.toggle('active', i === index);
    });
    if (options[index]) searchInput.setAttribute('aria-activedescendant', options[index].id);
    else searchInput.removeAttribute('aria-activedescendant');
  }
  const activeToolOption = () =>
    suggestedTools().findIndex((option) => option.classList.contains('active'));
  function suggestTools() {
    const query = searchInput.value.trim().toLowerCase();
    // Words are matched from their start, as typed: "rot" finds the tool that rotates pages,
    // not Protect a PDF, which merely contains the letters.
    const words = new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      'u',
    );
    const matches =
      query.length < 2
        ? []
        : toolCatalog()
            .filter(
              (entry) =>
                !entry.hidden &&
                words.test(
                  `${entry.label} ${entry.keywords || ''} ${entry.description || ''}`.toLowerCase(),
                ),
            )
            .slice(0, 5);
    toolList.replaceChildren(
      ...matches.map((entry, i) =>
        el(
          'button',
          {
            type: 'button',
            class: 'find-tool-item',
            id: `find-tool-option-${i}`,
            role: 'option',
            'aria-selected': 'false',
            'aria-label': `打开工具: ${entry.label}`,
            // A tool this PDF does not allow is offered as the pane shows it, dimmed: choosing
            // it used to close the find bar and do nothing.
            disabled: !toolsPanel.allows(entry.id),
            onclick: safe(async () => {
              closeSearch();
              if (entry.run && !entry.sections) return toolsPanel.open(entry.id);
              toolsPanel.open(entry.id);
              // A tool with a view of its own (Organize pages) shows it; where the pane would
              // cover that view, the pane stays aside, as when the tool is chosen in the pane.
              const covers = window.matchMedia('(max-width: 1000px)').matches;
              if (editorRoot.classList.contains('hide-tools') && !(entry.takesView && covers))
                await toggleToolsPanel(true);
            }),
          },
          toolIcon(entry.icon || entry.id, 18),
          el('span', {}, entry.label),
        ),
      ),
    );
    activateToolOption(-1);
    showToolSuggestions(matches.length > 0);
  }
  // Reached with Tab, the suggestions take the arrow keys too; Escape goes back to the words.
  toolList.addEventListener('keydown', (e) => {
    const options = suggestedTools();
    const at = options.indexOf(document.activeElement);
    if (at < 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = at + (e.key === 'ArrowDown' ? 1 : -1);
      (next < 0 ? searchInput : options[next % options.length]).focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      searchInput.focus();
    }
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    const options = toolSuggestions.hidden ? [] : suggestedTools();
    const active = activeToolOption();
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && options.length && !e.altKey) {
      // The arrow keys move through the suggested tools, as in a combobox; the focus stays here.
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      activateToolOption(
        active < 0
          ? step > 0
            ? 0
            : options.length - 1
          : (active + step + options.length) % options.length,
      );
    } else if (e.key === 'Enter' && active >= 0 && !e.shiftKey) {
      e.preventDefault();
      options[active].click();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      jumpMatch(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape' && active >= 0) {
      // A first Escape leaves the suggestions, as in a combobox; the next closes the find bar.
      e.preventDefault();
      e.stopPropagation();
      activateToolOption(-1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      // Escape closes the find bar and nothing else: the window handler would otherwise also
      // leave Crop or Link mode, discard a drawn crop area, or close a markup editor.
      e.stopPropagation();
      closeSearch();
    }
  });
  function closeSearch() {
    searchBar.hidden = true;
    showToolSuggestions(false);
    searchInput.value = '';
    resetSearch();
    workspace.focus();
  }
  const searchBar = el(
    'div',
    { class: 'find-bar', hidden: true },
    icon('Search', 17),
    searchInput,
    searchCount,
    iconButton('上一个匹配项', 'ChevronLeft', () => jumpMatch(-1)),
    iconButton('下一个匹配项', 'ChevronRight', () => jumpMatch(1)),
    iconButton('关闭搜索', 'X', closeSearch),
    toolSuggestions,
  );
  const statusPage = el('span');
  const pagesButton = iconButton('切换页面面板', 'PanelRight', () => toggleSidebar(), {
    'aria-controls': 'page-sidebar',
    'aria-expanded': 'true',
  });
  // The menu bar sits in the title bar, where a desktop PDF editor's window keeps its menus.
  const menubar = createMenubar(
    [
      { label: '文件', open: openFileMenu },
      { label: '编辑', open: openEditMenu },
      { label: '视图', open: openViewMenu },
      { label: '页面', open: openPageMenu },
      { label: '插入', open: openInsertMenu },
    ],
    { label: 'PDF 菜单' },
  );
  // On a phone the menus fold into one button; its File menu ends with the others.
  const menuButton = iconButton(
    '菜单',
    'EllipsisVertical',
    (e) => openFileMenu(e.currentTarget, true),
    { class: 'icon-btn mobile-only', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
  );
  // The tools pane on the left lists every tool, then holds the chosen tool's commands.
  const toolsPanel = createToolsPanel({
    catalog: () => toolCatalog(),
    can: (permission) => !!access()[permission],
    onClose: () => toggleToolsPanel(false),
    onChange: () => syncTopTabs(),
    // Where the pane overlays the document, it steps aside once a command needs the page.
    onAct: () => {
      if (window.matchMedia('(max-width: 1000px)').matches) toggleToolsPanel(false);
    },
  });
  const toolsPane = el(
    'aside',
    { id: 'tools-pane', class: 'tools-pane', 'aria-label': '工具' },
    toolsPanel.root,
  );
  /** The tabs across the top open the most used tools, as in a desktop PDF editor. */
  const TOP_TABS = [
    ['all', '全部工具'],
    ['edit', '编辑'],
    ['comment', '批注'],
    ['export', '导出'],
    ['fill-sign', '填写与签名'],
  ];
  const topTabs = el(
    'nav',
    { class: 'top-tabs', 'aria-label': '工具集' },
    ...TOP_TABS.map(([id, label]) =>
      el(
        'button',
        {
          type: 'button',
          class: 'top-tab',
          'data-tool': id,
          'aria-pressed': 'false',
          onclick: safe(() => openToolSet(id)),
        },
        label,
      ),
    ),
  );
  function syncTopTabs() {
    const shown = !editorRoot.classList.contains('hide-tools');
    const current = toolsPanel.current || 'all';
    let chosen = null;
    topTabs.querySelectorAll('.top-tab').forEach((tab) => {
      const pressed = shown && tab.dataset.tool === current;
      if (pressed && tab.getAttribute('aria-pressed') !== 'true') chosen = tab;
      tab.setAttribute('aria-pressed', String(pressed));
    });
    // Measured once pressed, as the chosen tab's bolder label is wider.
    if (chosen) revealTab(chosen);
  }
  // Where the tool sets do not fit (a phone), they scroll sideways. A fade marks each side
  // with more tabs, and the chosen tab is brought clear of the fade.
  function markTabOverflow() {
    const { scrollLeft, scrollWidth, clientWidth } = topTabs;
    topTabs.classList.toggle('more-start', scrollLeft > 1);
    topTabs.classList.toggle('more-end', scrollLeft + clientWidth < scrollWidth - 1);
  }
  function revealTab(tab) {
    if (topTabs.scrollWidth <= topTabs.clientWidth) return;
    const bar = topTabs.getBoundingClientRect(),
      box = tab.getBoundingClientRect(),
      fade = 24;
    if (box.left < bar.left + fade) topTabs.scrollLeft -= bar.left + fade - box.left;
    else if (box.right > bar.right - fade) topTabs.scrollLeft += box.right - (bar.right - fade);
  }
  topTabs.addEventListener('scroll', markTabOverflow, { passive: true });
  const tabsObserver = new ResizeObserver(markTabOverflow);
  tabsObserver.observe(topTabs);
  /** Show the tools pane with a tool, or with the list of every tool. */
  async function openToolSet(id) {
    const shown = !editorRoot.classList.contains('hide-tools');
    // Where the pane overlays the page it steps aside while a tool is in use; Tools brings it
    // back with that tool rather than leaving it.
    const resume = !shown && toolsPanel.current && window.matchMedia('(max-width: 1000px)').matches;
    if (id === 'all' && resume) {
      await toggleToolsPanel(true);
      return;
    }
    if (id === 'all') toolsPanel.showAll();
    else toolsPanel.open(id);
    if (!shown) await toggleToolsPanel(true);
    syncTopTabs();
  }
  async function toggleToolsPanel(show = editorRoot.classList.contains('hide-tools')) {
    const hadFocus = toolsPane.contains(document.activeElement);
    // On a phone both panels lie over the page, and the tools pane covered most of the side
    // panel; one overlay at a time, as with popovers.
    if (show && window.matchMedia('(max-width: 760px)').matches) hideSidebar();
    editorRoot.classList.toggle('hide-tools', !show);
    if (!show && hadFocus) workspace.focus({ preventScroll: true });
    syncTopTabs();
    snapPaper();
    setTimeout(refitPage, 0);
  }
  const findToolsButton = el(
    'button',
    {
      type: 'button',
      class: 'find-tools',
      'aria-label': '查找文本或工具',
      title: withShortcut('查找文本或工具', 'Mod+F'),
      onclick: () => openSearch(),
    },
    el('span', {}, '查找文本或工具'),
    icon('Search', 17),
  );
  // The quick tools are one stop in the tab order, as a toolbar is: the arrow keys move
  // between them and Home and End go to the ends. The stop stays on the last one used.
  let toolbarStop = null;
  const toolbarKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
  const quickTools = el(
    'div',
    {
      class: 'toolbar quick-tools',
      role: 'toolbar',
      'aria-label': 'PDF 工具',
      onfocusin: (e) => {
        if (!(e.target instanceof HTMLButtonElement)) return;
        toolbarStop = e.target;
        syncToolbarStop();
      },
      onkeydown: (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !toolbarKeys.includes(e.key))
          return;
        const buttons = [...quickTools.querySelectorAll('button')].filter(
          (b) => !b.disabled && b.getClientRects().length,
        );
        const at = buttons.indexOf(document.activeElement);
        if (at === -1) return;
        // Home and End are the toolbar's here, not the document's first and last page.
        e.preventDefault();
        e.stopPropagation();
        const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
        const next =
          e.key === 'Home'
            ? buttons[0]
            : e.key === 'End'
              ? buttons.at(-1)
              : buttons[(at + step + buttons.length) % buttons.length];
        next.focus();
      },
    },
    toolGroup,
    el(
      'div',
      { class: 'tool-group' },
      button('图片', 'Image', safe(insertImage), 'tool-btn', {
        'data-permission': 'edit',
      }),
      button('签名', 'Signature', safe(insertSignature), 'tool-btn', {
        'data-permission': 'edit',
      }),
      button('填写表单', 'ListChecks', safe(formDialog), 'tool-btn', {
        'data-permission': 'fill',
      }),
    ),
  );
  /** Keep the toolbar's tab stop on a button that can take it. */
  function syncToolbarStop() {
    const buttons = [...quickTools.querySelectorAll('button')];
    // While busy every button is briefly disabled; the stop waits for them rather than moving.
    if (!toolbarStop || (toolbarStop.disabled && !busy)) {
      const usable = (b) => !b.disabled && b.getClientRects().length > 0;
      const pressed = (b) => b.getAttribute('aria-pressed') === 'true';
      // Before the toolbar is laid out nothing is usable yet; it must still keep a stop.
      toolbarStop =
        buttons.find((b) => pressed(b) && usable(b)) ||
        buttons.find(usable) ||
        toolbarStop ||
        buttons.find(pressed) ||
        buttons[0];
    }
    for (const b of buttons) {
      const index = b === toolbarStop ? 0 : -1;
      if (b.tabIndex !== index) b.tabIndex = index;
    }
  }
  const editorRoot = el(
    'div',
    { class: darkPages ? 'editor dark-pages' : 'editor', 'data-tool': tool },
    // One banner over the page: the title bar with the menus and the document, the tool sets
    // and file commands, and the find bar. Kept together so no control sits outside a
    // landmark for anyone browsing by region.
    el(
      'header',
      { class: 'editor-header' },
      el(
        'div',
        { class: 'topbar editor-topbar' },
        el(
          'div',
          { class: 'topbar-row' },
          iconButton('返回文档库', 'House', goHome, { class: 'icon-btn home-btn' }),
          menubar.el,
          el(
            'div',
            { class: 'document-tab' },
            el('span', { class: 'editor-brand' }, appIcon(18, 'PDF 编辑器')),
            el(
              'div',
              { class: 'document-info' },
              el('h1', { class: 'document-title' }, nameButton),
              el('div', { class: 'status-row' }, saveStatus, protectionBadge),
            ),
          ),
          el(
            'div',
            { class: 'header-right' },
            menuButton,
            appsButton(),
            iconButton('设置', 'Settings2', settings),
            userMenuSlot(),
          ),
        ),
      ),
      el(
        'div',
        { class: 'appbar' },
        topTabs,
        el(
          'div',
          { class: 'appbar-end' },
          findToolsButton,
          el('span', { class: 'appbar-sep', 'aria-hidden': 'true' }),
          undoButton,
          redoButton,
          el('span', { class: 'appbar-sep', 'aria-hidden': 'true' }),
          iconButton(
            'Download',
            'Download',
            safe(() => downloadPdf()),
            {
              class: 'icon-btn download-btn',
              // When Puter opened the app the shortcut saves to another folder instead.
              ...(!P.launchedByPuter() && { title: withShortcut('下载', 'Mod+Shift+S') }),
            },
          ),
          iconButton(
            '打印文件',
            'Printer',
            () => {
              if (!busy) pageDialog(printDialog)();
            },
            {
              class: 'icon-btn print-btn',
              'data-permission': 'print',
              title: withShortcut('打印文件', 'Mod+P'),
            },
          ),
          saveButton,
        ),
      ),
      pageForms.error,
    ),
    el(
      'main',
      { id: 'main', class: 'editor-main', tabindex: '-1' },
      toolsPane,
      properties.root,
      el(
        'div',
        { class: 'document-area' },
        el('div', { class: 'contextbar' }, hint, toolOptions),
        searchBar,
        signatureBar.el,
        standardsBar,
        el(
          'div',
          { class: 'document-view' },
          quickTools,
          workspace,
          organizer.root,
          el(
            'div',
            { class: 'page-controls statusbar' },
            el('div', { class: 'page-navigation' }, prevButton, pageInput, pageTotal, nextButton),
            el(
              'div',
              { class: 'zoom-controls', role: 'group', 'aria-label': '缩放控制' },
              zoomOutButton,
              zoomSelect,
              zoomInButton,
            ),
          ),
        ),
      ),
      // The rail comes first in the keyboard order, so a tab leads straight into its panel.
      el('nav', { class: 'right-rail', 'aria-label': '侧边面板' }, sidebarTabs, pagesButton),
      sidebar,
      accessibleText,
    ),
  );
  root.replaceChildren(editorRoot);
  const printNotice = el('p', { class: 'print-permissions-message' });
  document.body.append(printNotice);
  const restrictCopy = (event) => {
    if (
      access().copy ||
      destroyed ||
      event.target === searchInput ||
      ['owner-password', 'unlock-password'].includes(event.target?.id)
    )
      return;
    event.preventDefault();
    if (event.type !== 'dragstart')
      toast('此 PDF 的权限不允许复制。', { error: true });
  };
  document.addEventListener('copy', restrictCopy);
  document.addEventListener('cut', restrictCopy);
  document.addEventListener('dragstart', restrictCopy);
  editorRoot.addEventListener('contextmenu', (event) => {
    if (!access().copy && event.target.matches('canvas, img')) event.preventDefault();
  });
  // A draft of right-to-left text is edited in reading order; the PDF draws it in visual order.
  const drawnText = (edit, text) => (edit.direction ? reorderText(text, edit.direction) : text);
  const drawnSegments = (edit, segments) =>
    edit.direction && segments ? reorderSegments(segments, edit.direction) : segments;
  function pendingTextEdit() {
    return Boolean(
      textEdit &&
      (textEdit.positionControl?.pending ||
        textEdit.widthControl?.pending ||
        drawnText(textEdit, textEdit.input.value) !== (textEdit.run?.text || '') ||
        (textEdit.run?.parts &&
          JSON.stringify(drawnSegments(textEdit, textEdit.input.segments())) !==
            JSON.stringify(textEdit.run.segments)) ||
        (textEdit.run &&
          (styleChanged(textEdit) ||
            decorationChanged(textEdit) ||
            Math.abs(textEdit.size - textEdit.run.state.size) > 1e-8 ||
            textEdit.hex !== textColor(textEdit.run) ||
            Math.abs((textEdit.width || 0) - (textEdit.originalWidth || 0)) > 1e-8 ||
            textEdit.offset.some((n) => Math.abs(n) > 1e-8)))),
    );
  }
  // Rewriting text that has not changed still replaces it, and Chrome then closes the typing
  // step of an open text draft: Undo there took back one character at a time.
  const setText = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };
  function updateStatus() {
    if (destroyed) return;
    // A brief refresh must still block duplicate actions, without flashing every control
    // gray. Keep each button's resting appearance until the new page is ready; buttons
    // already unavailable (such as Redo with no history) retain their disabled appearance.
    const refreshing = !initializing && (busy || !pageReady);
    if (refreshing !== editorRoot.classList.contains('refreshing')) {
      editorRoot
        .querySelectorAll(
          '.editor-header button, .statusbar button, .quick-tools button, .right-rail button',
        )
        .forEach((button) => {
          button.classList.toggle(
            'busy-enabled',
            refreshing && !button.disabled && button.getAttribute('aria-disabled') !== 'true',
          );
        });
      editorRoot.classList.toggle('refreshing', refreshing);
    }
    editorRoot.querySelectorAll('.toolbar button').forEach((b) => {
      b.disabled = busy || (b.dataset.permission && !access()[b.dataset.permission]);
    });
    syncToolbarStop();
    editorRoot.querySelector('.download-btn').disabled = busy || downloading;
    editorRoot.querySelector('.print-btn').disabled = busy || !access().print;
    textTargets.querySelectorAll('button').forEach((button) => {
      button.disabled = busy || !pageReady;
    });
    setStepOff(zoomInButton, busy || !pdf || zoom >= ZOOM_LEVELS.at(-1) - 1e-9);
    setStepOff(zoomOutButton, busy || !pdf || zoom <= ZOOM_LEVELS[0] + 1e-9);
    setText(nameButton.querySelector('span'), name.replace(/\.pdf$/i, ''));
    nameButton.setAttribute('aria-label', `重命名 ${name}`);
    // The name is clipped on narrow screens, so the tooltip carries it in full.
    nameButton.title = name;
    pageForms.setBusy(busy || !pageReady || !access().fill);
    pageImages.setBusy(busy || !pageReady || !access().edit);
    const pendingText =
      pendingTextEdit() || pendingNoteEdit() || pageForms.draft.dirty || pageImages.dirty;
    const unsaved = session.dirty || pendingText || protectionDirty;
    const title = `${unsaved ? '* ' : ''}${shownTitle || name} · PDF 编辑器`;
    if (document.title !== title) document.title = title;
    // The desktop window shows the file, marked while it has unsaved changes, as its neighbours do.
    P.setWindowTitle(`${unsaved ? '● ' : ''}${name}`);
    protectionBadge.hidden = !protection;
    if (tool === 'select' && !access().owner)
      setText(
        hint,
        '此 PDF 设有文档权限。选择“受保护”可查看权限或解锁编辑。',
      );
    protectionBadge.disabled = busy;
    protectionBadge.title = access().owner
      ? '已保护。可更改或移除密码与限制。'
      : '查看权限，或使用权限密码解锁编辑。';
    document.body.classList.toggle('pdf-restricted-print', !access().printHighQuality);
    setText(
      printNotice,
      access().print
        ? '请使用 PDF 编辑器中的“文件 → 打印”，按允许的分辨率打印此文档。'
        : '此 PDF 的权限不允许打印。',
    );
    setText(
      saveStatus,
      activity
        ? activity
        : saving
          ? '正在保存…'
          : initializing
            ? '正在打开 PDF…'
            : unsaved
              ? '有未保存的更改'
              : path && cloudRevision === session.revision
                ? '已保存到本地'
                : downloadedRevision === session.revision
                  ? '已下载'
                  : '本地文件',
    );
    saveStatus.title = saveStatus.textContent;
    saveButton.disabled = saving || busy;
    // Without a session the button says what saving needs first.
    const saveLabel = path ? '保存' : '保存到本地';
    setText(saveButton.querySelector('span'), saveLabel);
    saveButton.setAttribute('aria-label', saveLabel);
    saveButton.title = withShortcut(saveLabel, 'Mod+S');
    nameButton.disabled = busy || saving;
    centerButton.disabled = busy || !pageReady;
    highlightButton.disabled = busy || !pageReady || !(highlightSelection || highlightCaptureTimer);
    const markupDisabled = busy || !pageReady || !access().annotate;
    const setMarkupDisabled = (control) => {
      control.disabled = markupDisabled;
    };
    highlightTargets.querySelectorAll('button').forEach(setMarkupDisabled);
    properties.root.querySelectorAll('[data-markup-mutation]').forEach(setMarkupDisabled);
    setStepOff(
      undoButton,
      busy || (!session.past.length && !pendingText && !pageForms.draft.past.length),
    );
    setStepOff(
      redoButton,
      busy ||
        pendingTextEdit() ||
        pendingNoteEdit() ||
        pageImages.dirty ||
        (!pageForms.draft.future.length && (pageForms.draft.dirty || !session.future.length)),
    );
    if (pdf) {
      if (!pageInputDirty) pageInput.value = String(pageIndex + 1);
      pageInput.max = String(pdf.numPages);
      setText(pageTotal, `/ ${pdf.numPages}`);
      setText(statusPage, `${pdf.numPages} 页`);
    }
    const destination = clampPageIndex(pendingNavigation?.index ?? pageIndex);
    // Side by side, the buttons turn pairs: the other page of the pair on view is in sight.
    const turn = (index) => (stack.twoUp ? Math.floor(index / 2) : index);
    setStepOff(prevButton, !pageCount || turn(destination) === 0);
    setStepOff(nextButton, !pageCount || turn(destination) >= turn(pageCount - 1));
    editorRoot.setAttribute('aria-busy', String(busy));
    if (organizer.visible && organizer.busy !== busy) organizer.updateState();
    // The tools pane's commands follow the busy state; redraw only when it changes.
    if (toolsBusy !== busy) {
      toolsBusy = busy;
      toolsPanel.refresh();
    }
  }
  async function reload(retainedScale = null) {
    if (destroyed) return;
    const token = ++generation;
    editDocument = null;
    textRunCache.clear();
    imageRunCache.clear();
    searchTextCache.clear();
    resetSearch();
    pageRenderGeneration++;
    pageReady = false;
    pageImages.close(true, { preservePreview: true, preserveControls: true });
    gesture = null;
    discardCropDraft();
    if (!committingDrawing) clearOverlay();
    renderTask?.cancel();
    textLayer?.cancel();
    thumbnailObserver?.disconnect();
    // PDF.js removes its FontFaces when the old document is destroyed. A committing
    // draft still needs those faces until its replacement is painted; retaining just
    // the loaded faces avoids keeping the old PDF and its decoded images alive.
    const family = (name) => name.trim().replace(/^["']|["']$/g, '');
    const families = new Set(
      [...paper.querySelectorAll('.page-text-input, .page-text-input [data-part]')].flatMap(
        (node) => getComputedStyle(node).fontFamily.split(',').map(family),
      ),
    );
    const draftFonts = families.size
      ? [...document.fonts].filter((face) => families.has(family(face.family)))
      : [];
    const old = loadingTask;
    documentLayers = null;
    pdf = null;
    currentPage = null;
    loadingTask = null;
    await old?.destroy();
    const retainedFonts = draftFonts.filter((face) => !document.fonts.has(face));
    retainedFonts.forEach((face) => document.fonts.add(face));
    try {
      if (destroyed || token !== generation) return;
      const task = loadPdf(session.bytes.slice());
      loadingTask = task;
      const next = await task.promise;
      if (destroyed || token !== generation) {
        await task.destroy();
        return;
      }
      pdf = next;
      // A PDF that asks to be shown by its title is named by the title it has now: details,
      // an accessibility fix, removing hidden information, or undo can each change it.
      Promise.all([next.getViewerPreferences(), next.getMetadata()])
        .then(([prefs, { info }]) => {
          if (destroyed || pdf !== next) return;
          shownTitle = (prefs?.get('DisplayDocTitle') && String(info?.Title ?? '').trim()) || null;
          updateStatus();
        })
        .catch(() => {});
      // One layer configuration per document, shared by every picture of its pages, so the
      // Layers panel's switches apply everywhere.
      documentLayers = next.getOptionalContentConfig({ intent: 'display' }).then((config) => {
        for (const [id, visible] of layerChoices)
          if (config.getGroup(id)) config.setVisibility(id, visible);
        return config;
      });
      // Keep the count available while the renderer is replaced after an edit, so
      // navigation requests can still be bounded against the displayed document.
      pageCount = pdf.numPages;
      pageIndex = Math.min(pageIndex, pdf.numPages - 1);
      const rebuilt = stack.count !== pageCount;
      if (rebuilt) stack.rebuild(pageCount);
      // Fit width and fit page follow the largest page, whose size can arrive after the
      // current page has been fitted; the zoom then catches up, as it does after a resize.
      stack.loadSizes(next, session.geometry).then(() => {
        if (destroyed || pdf !== next) return;
        fitSizesStale = true;
        refitPage();
      });
      renderThumbnails();
      toolsPanel.refresh();
      organizer.refresh();
      refreshRedactionMarks().catch(() => {});
      const isCurrent = () => !destroyed && pdf === next;
      outline.load(next, { isCurrent }).then((hasOutline) => {
        if (destroyed || pdf !== next) return;
        sidebarTabs.querySelector('[data-tab="outline"]').hidden = !hasOutline;
        if (!hasOutline && sidebarTab === 'outline') {
          // The last bookmark removed takes the tab and the focus with it; the keyboard goes
          // on from the Pages tab that takes its place rather than from the top of the app.
          const lost = !document.activeElement || document.activeElement === document.body;
          showSidebarTab('pages');
          if (lost && !editorRoot.classList.contains('hide-pages'))
            sidebarTabs.querySelector('[data-tab="pages"]').focus({ preventScroll: true });
        }
        if (hasOutline) outline.setCurrent(pageIndex);
      });
      loadAttachments(next);
      validateSignatures().catch(() => {});
      documentLayers
        .then((config) => {
          if (destroyed || pdf !== next) return;
          const any = layers.show(config);
          sidebarTabs.querySelector('[data-tab="layers"]').hidden = !any;
          if (!any && sidebarTab === 'layers') showSidebarTab('pages');
        })
        .catch(() => {});
      comments.load(next, { isCurrent }).then((result) => {
        if (destroyed || pdf !== next || !result) return;
        const { total, capped } = result;
        commentsBadge.textContent = total > 99 ? '99+' : String(total);
        commentsBadge.hidden = !total;
        // The badge is decorative, so its number is spelled into the tab's own name. A PDF with
        // more comments than the list holds is counted as "and more", not as that number.
        const commentsTab = sidebarTabs.querySelector('[data-tab="comments"]');
        const shown = capped ? `${total.toLocaleString()} 条以上` : String(total);
        const commentsLabel = total ? `批注（${shown}）` : '批注';
        commentsTab.setAttribute('aria-label', commentsLabel);
        commentsTab.setAttribute('title', commentsLabel);
      });
      updateStatus();
      await renderPage(retainedScale);
      // Pages added or removed move the others; the current page comes back into view.
      if (rebuilt && !destroyed && pdf === next) stack.scrollTo(pageIndex);
      if (!destroyed && pdf === next) stack.refresh();
      if (searchInput.value.trim()) scheduleSearch();
    } finally {
      // The draft is removed by finishTextEdit in this same microtask turn.
      retainedFonts.forEach((face) => document.fonts.delete(face));
    }
  }
  /**
   * Centering leaves the page at a half device pixel whenever the spare width is odd, which
   * blurs the rendered canvas and the text drafts drawn over it. Nudge it onto whole pixels.
   */
  function snapPaper() {
    if (paper.hidden) return;
    paper.style.left = '0px';
    const ratio = window.devicePixelRatio || 1;
    const left = paper.getBoundingClientRect().left;
    const shift = Math.round(left * ratio) / ratio - left;
    if (Math.abs(shift) > 1e-6) paper.style.left = `${shift}px`;
  }
  let pageRenderGeneration = 0;
  /** What a zoom does once the page is laid out at its new scale (see setZoom). */
  let zoomPlacement = null;
  async function renderPage(retainedScale = null) {
    if (!pdf || destroyed) return;
    const token = ++pageRenderGeneration;
    const placed = zoomPlacement;
    zoomPlacement = null;
    pageReady = false;
    commentThreads = null;
    textTargets.replaceChildren();
    clearHighlightSelection();
    selectedHighlight = null;
    highlightTargets.replaceChildren();
    properties.clear('highlight');
    closeNoteEditor();
    noteTargets.replaceChildren();
    gesture = null;
    discardCropDraft();
    if (!committingDrawing) clearOverlay();
    paper.setAttribute('aria-busy', 'true');
    updateStatus();
    renderTask?.cancel();
    textLayer?.cancel();
    const rendered = el('canvas');
    try {
      const page = await pdf.getPage(pageIndex + 1);
      if (token !== pageRenderGeneration || destroyed) return;
      // The page left behind releases its decoded pictures (see the thumbnails).
      if (currentPage && currentPage !== page) currentPage.cleanup();
      currentPage = page;
      const natural = page.getViewport({ scale: 1 });
      // An object's properties dock must not refit the page when its edit redraws it.
      // Preserve the selection's scale until deselection; newer zoom/page choices still win.
      const keepScale =
        retainedScale &&
        retainedScale.page === pageIndex &&
        retainedScale.mode === scaleMode &&
        (retainedScale.request === pendingZoom || pendingZoom?.mode !== scaleMode);
      if (!textCheckpoint && !keepScale) {
        renderedWorkspaceWidth = workspace.clientWidth;
        renderedWorkspaceHeight = workspace.clientHeight;
        fitSizesStale = false;
        zoom = computeZoom(natural);
      }
      syncZoomSelect();
      const nextViewport = page.getViewport({ scale: zoom });
      // Match the device ratio within the pixel budget: drafts are DOM text rasterized at the
      // device ratio, so a page rendered at a lower ratio positions hinted glyphs differently.
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        Math.sqrt(16000000 / (nextViewport.width * nextViewport.height)),
        8192 / nextViewport.width,
        8192 / nextViewport.height,
      );
      // Keep the last complete page visible while PDF.js clears and progressively paints
      // its replacement. Each render owns its buffer, including cancelled zoom/navigation.
      rendered.width = Math.max(1, Math.floor(nextViewport.width * ratio));
      rendered.height = Math.max(1, Math.floor(nextViewport.height * ratio));
      const layers = documentLayers || pdf.getOptionalContentConfig({ intent: 'display' });
      renderTask = page.render({
        canvasContext: rendered.getContext('2d'),
        viewport: nextViewport,
        transform: [ratio, 0, 0, ratio, 0, 0],
        annotationMode: pdfjs.AnnotationMode.ENABLE,
        optionalContentConfigPromise: layers,
      });
      await renderTask.promise;
      if (token !== pageRenderGeneration || destroyed) return;
      const [content, annotations, layerConfig] = await Promise.all([
        page.getTextContent(),
        page.getAnnotations({ intent: 'display' }).catch(() => []),
        layers,
      ]);
      if (token !== pageRenderGeneration || destroyed) return;
      const hiddenAnnotations = new Set();
      const visibleAnnotations = annotations.filter((annotation) => {
        if (annotationLayerVisible(annotation, layerConfig)) return true;
        hiddenAnnotations.add(editorAnnotationId(annotation.id));
        return false;
      });
      // PDF.js draws nothing for a redaction mark without an appearance stream, as other tools
      // may write them; such marks are outlined as the app's own marks are, so they are seen.
      const bareRedactions = new Set(
        visibleAnnotations
          .filter((a) => a.subtype === 'Redact' && !a.hasAppearance && !(a.annotationFlags & 34))
          .map((a) => a.id),
      );
      if (bareRedactions.size) {
        const doc =
          editDocument || (await PDFDocument.load(session.bytes, { updateMetadata: false }));
        const { pageRedactionOutlines } = await loadRedaction();
        if (token !== pageRenderGeneration || destroyed) return;
        editDocument = doc;
        const context = rendered.getContext('2d');
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.lineWidth = nextViewport.scale;
        for (const mark of pageRedactionOutlines(doc, pageIndex)) {
          if (!bareRedactions.has(mark.id)) continue;
          context.strokeStyle = mark.outline;
          for (const [x1, y1, x2, y2] of mark.rects) {
            const [a, b] = nextViewport.convertToViewportPoint(x1 + 0.5, y1 + 0.5);
            const [c, d] = nextViewport.convertToViewportPoint(x2 - 0.5, y2 - 0.5);
            context.strokeRect(Math.min(a, c), Math.min(b, d), Math.abs(c - a), Math.abs(d - b));
          }
        }
      }
      viewport = nextViewport;
      pagePixelRatio = ratio;
      stack.place(paper, pageIndex);
      paintCanvas(canvas, rendered, viewport);
      paper.style.width = `${viewport.width}px`;
      paper.style.height = `${viewport.height}px`;
      paper.hidden = false;
      snapPaper();
      placed?.();
      paper.style.setProperty('--scale-factor', zoom);
      paper.style.setProperty('--user-unit', page.userUnit || 1);
      const overlayRatio = Math.min(1, ratio);
      overlay.width = Math.max(1, Math.floor(viewport.width * overlayRatio));
      overlay.height = Math.max(1, Math.floor(viewport.height * overlayRatio));
      // PDF.js validates `url`; `unsafeUrl` is whatever the file said, so it is checked here
      // before it can be opened. A link whose address is refused stays listed so it
      // can still be edited or removed, but it opens nothing.
      // Every link is listed, so one that opens another file, starts a program, or runs a
      // script can still be corrected or removed; "next page" and the like are followed.
      links = visibleAnnotations
        .filter((a) => a.subtype === 'Link')
        .map((a) => {
          const url = a.url || safeLinkUrl(a.unsafeUrl);
          const action = !url && !a.dest && namedPage(a.action, 0) != null ? a.action : null;
          return {
            id: a.id,
            rect: a.rect,
            url,
            address: a.unsafeUrl || a.url || '',
            dest: a.dest,
            action,
            blocked: !url && !a.dest && !action,
            readOnly: !!(a.annotationFlags & 64),
            locked: !!(a.annotationFlags & 128),
          };
        });
      renderLinkTargets();
      textContainer.replaceChildren();
      textLayer = new pdfjs.TextLayer({
        textContentSource: content,
        container: textContainer,
        viewport,
      });
      await textLayer.render();
      if (token !== pageRenderGeneration || destroyed) return;
      alignTextLayer(textLayer, content, viewport);
      if (['text', 'select'].includes(tool) && access().edit && !(await indexTextRuns(page, token)))
        return;
      textRuns = textRunCache.get(pageIndex) || [];
      renderTextTargets();
      pageTextIndex = indexPageText(content.items);
      // PDF.js reports both an unselected button and the selected export "Off" as "Off".
      const ambiguousButtons = new Set(
        annotations
          .filter(
            (a) =>
              a.fieldType === 'Btn' &&
              a.fieldValue === 'Off' &&
              (a.buttonValue === 'Off' || a.exportValue === 'Off'),
          )
          .map((a) => a.fieldName),
      );
      let buttonSelections;
      if (ambiguousButtons.size) {
        const doc =
          editDocument || (await loadPdfDocument(session.bytes, { updateMetadata: false }));
        if (token !== pageRenderGeneration || destroyed) return;
        editDocument = doc;
        buttonSelections = formButtonSelections(doc, ambiguousButtons);
      }
      // A tooltip kept on a field above its widgets needs the document, when it is loaded.
      const tooltips =
        editDocument && annotations.some((a) => a.fieldName && !a.alternativeText)
          ? formFieldTooltips(editDocument)
          : undefined;
      // Radio buttons that share an export value: PDF.js reports which value is on, not which
      // button, so the document tells them apart. It is read for them, or when already loaded.
      const radios = annotations.filter((a) => a.radioButton && a.fieldName);
      const sharedRadio = radios.some((a, i) =>
        radios.some(
          (b, j) => j > i && b.fieldName === a.fieldName && b.buttonValue === a.buttonValue,
        ),
      );
      let radioChoices;
      if (radios.length && (editDocument || sharedRadio)) {
        const doc =
          editDocument || (await loadPdfDocument(session.bytes, { updateMetadata: false }));
        if (token !== pageRenderGeneration || destroyed) return;
        editDocument = doc;
        radioChoices = radioButtonChoices(doc);
      }
      // Likewise lists whose options share an export value: /I tells which one is chosen.
      let listSelections;
      if (
        annotations.some(
          (a) =>
            a.fieldType === 'Ch' &&
            new Set(a.options?.map((o) => o.exportValue)).size < (a.options?.length ?? 0),
        )
      ) {
        const doc =
          editDocument || (await loadPdfDocument(session.bytes, { updateMetadata: false }));
        if (token !== pageRenderGeneration || destroyed) return;
        editDocument = doc;
        listSelections = sharedChoiceSelections(doc);
      }
      // The page's tab order (/Tabs), which PDF.js does not report, for a page with fields to
      // visit. The document is loaded already to edit in Select; a form that may only be
      // filled in is read for it.
      let tabs;
      if (annotations.filter((a) => a.fieldName && a.fieldType !== 'Sig').length > 1) {
        const doc =
          editDocument || (await loadPdfDocument(session.bytes, { updateMetadata: false }));
        if (token !== pageRenderGeneration || destroyed) return;
        editDocument = doc;
        tabs = doc.getPage(pageIndex).node.lookup(PDFName.of('Tabs'))?.asString?.().slice(1);
      }
      pageForms.render(
        annotations,
        viewport,
        `${session.revision}:${pageIndex}`,
        layerConfig,
        buttonSelections,
        tooltips,
        radioChoices,
        listSelections,
        tabs,
      );
      pageForms.setBusy(busy || !pageReady || !access().fill);
      pageForms.setEnabled(tool === 'select' && !preparing);
      highlights = [];
      if (
        visibleAnnotations.some((a) => ['Highlight', 'Underline', 'StrikeOut'].includes(a.subtype))
      ) {
        const doc =
          editDocument || (await loadPdfDocument(session.bytes, { updateMetadata: false }));
        if (token !== pageRenderGeneration || destroyed) return;
        editDocument = doc;
        highlights = listHighlights(doc, pageIndex).filter(
          (entry) => !hiddenAnnotations.has(entry.id),
        );
      }
      renderHighlightTargets();
      notes = [];
      if (visibleAnnotations.some((a) => a.subtype === 'Text')) {
        const doc =
          editDocument || (await loadPdfDocument(session.bytes, { updateMetadata: false }));
        if (token !== pageRenderGeneration || destroyed) return;
        editDocument = doc;
        notes = listNotes(doc, pageIndex).filter((entry) => !hiddenAnnotations.has(entry.id));
      }
      renderNoteTargets();
      let annotationEntries = [];
      if (visibleAnnotations.some((a) => ANNOTATION_KINDS.has(a.subtype))) {
        const doc =
          editDocument || (await loadPdfDocument(session.bytes, { updateMetadata: false }));
        if (token !== pageRenderGeneration || destroyed) return;
        editDocument = doc;
        try {
          annotationEntries = listAnnotations(doc, pageIndex).filter(
            (entry) => ANNOTATION_KINDS.has(entry.subtype) && !hiddenAnnotations.has(entry.id),
          );
        } catch {
          annotationEntries = [];
        }
      }
      annotationLayer.render(annotationEntries, viewport);
      annotationLayer.setEnabled(tool === 'select');
      if (tool === 'select' && !(await indexPageObjects(token))) return;
      pageImages.render(
        imageRunCache.get(pageIndex) || [],
        viewport,
        `${session.revision}:${pageIndex}`,
        pageIndex,
      );
      pageImages.setEnabled(tool === 'select' && access().edit);
      pageReady = true;
      accessibleText.textContent = access().accessibility
        ? content.items.map((i) => i.str || '').join(' ')
        : '';
      textContainer.setAttribute('aria-hidden', String(!access().accessibility));
      markSearch();
      // A comment chosen from the list opens once the page is ready to show its editor.
      if (revealComment) applyRevealComment().catch(() => {});
      pageCaption.textContent = `第 ${pageIndex + 1} 页，共 ${pdf.numPages} 页`;
      outline.setCurrent(pageIndex);
      thumbnails
        .querySelectorAll('.thumbnail')
        .forEach((node, i) =>
          node.setAttribute('aria-current', i === pageIndex ? 'page' : 'false'),
        );
      // Tabbing into the pages lands on the current one, unless the list has the focus.
      if (!thumbnails.contains(document.activeElement))
        setThumbnailStop(thumbnails.children[pageIndex]?.querySelector('.thumbnail'));
      if (revealedThumbnail !== pageIndex) revealThumbnail();
      // Re-renders of the same page (zoom, edits) must not repeat the announcement.
      const announcer = document.querySelector('#announcer');
      if (announcer.textContent !== pageCaption.textContent)
        announcer.textContent = pageCaption.textContent;
      updateStatus();
      setTimeout(() => {
        stack.recheck();
        if (fitSizesStale) refitPage();
      }, 0);
      if (preparing) refreshDesigner().catch(() => {});
    } catch (e) {
      if (e.name !== 'RenderingCancelledException' && token === pageRenderGeneration && !destroyed)
        toast('无法渲染此页面。请尝试其他页面或重新打开 PDF。');
    } finally {
      rendered.width = rendered.height = 0;
      if (token === pageRenderGeneration && !destroyed) {
        paper.setAttribute('aria-busy', 'false');
        updateStatus();
      }
    }
  }
  /** Index editable text once per page and revision. False means the page moved on meanwhile. */
  async function indexTextRuns(page, token) {
    if (textRunCache.has(pageIndex)) return true;
    let runs = [];
    try {
      const [doc, layers] = await Promise.all([
        editDocument || loadPdfDocument(session.bytes, { updateMetadata: false }),
        documentLayers || pdf.getOptionalContentConfig({ intent: 'display' }),
      ]);
      if (token !== pageRenderGeneration || destroyed) return false;
      editDocument = doc;
      runs = groupTextParagraphs(
        groupTextRuns(await inspectText(doc, pageIndex, page, pdfjs.OPS, layers)),
      );
    } catch {
      // Editing support must not prevent an otherwise readable PDF from opening.
    }
    if (token !== pageRenderGeneration || destroyed) return false;
    textRunCache.set(pageIndex, runs);
    return true;
  }
  /** Index editable images, shapes, and drawings once per page and revision. */
  async function indexPageObjects(token) {
    if (imageRunCache.has(pageIndex)) return true;
    let images = [];
    try {
      const doc = editDocument || (await loadPdfDocument(session.bytes, { updateMetadata: false }));
      if (token !== pageRenderGeneration || destroyed) return false;
      editDocument = doc;
      images = inspectImages(doc, pageIndex).map((entry, i) => ({
        ...entry,
        kind: 'image',
        labelIndex: i,
      }));
      const counts = { shape: 0, drawing: 0, signature: 0, stamp: 0 };
      const paths = inspectPaths(doc, pageIndex).map((entry, i) => ({
        ...entry,
        ordinal: images.length + i,
        labelIndex: counts[entry.kind]++,
      }));
      images.push(...paths);
      images.sort((a, b) => {
        const x = [...a.path.map((p) => p.start), a.start],
          y = [...b.path.map((p) => p.start), b.start];
        for (let i = 0; i < Math.min(x.length, y.length); i++)
          if (x[i] !== y[i]) return x[i] - y[i];
        return x.length - y.length;
      });
    } catch {
      /* Unsupported object structures do not prevent page rendering. */
    }
    if (token !== pageRenderGeneration || destroyed) return false;
    imageRunCache.set(pageIndex, images);
    return true;
  }
  let revealedThumbnail = -1;
  // A page moved from its thumbnail's menu: the keyboard goes with it ({ from, to }).
  let movedThumbnail = null;
  /** Keep the current page's thumbnail inside the panel's scroll viewport. */
  function revealThumbnail() {
    if (editorRoot.classList.contains('hide-pages')) return;
    thumbnails.children[pageIndex]?.scrollIntoView({ block: 'nearest' });
    revealedThumbnail = pageIndex;
  }
  function renderThumbnails() {
    // Rebuilding the list would drop the focus a thumbnail's menu returned there, so the same
    // page's button (or menu button) gets it back once the list exists again.
    const focused = document.activeElement;
    const restore = thumbnails.contains(focused)
      ? {
          index: Number(focused.closest('.thumb-item')?.dataset.index),
          menu: focused.classList.contains('thumb-menu'),
        }
      : null;
    if (restore && movedThumbnail?.from === restore.index) restore.index = movedThumbnail.to;
    const canvases = [...thumbnails.querySelectorAll('.thumb-paper canvas')];
    thumbnails.replaceChildren();
    const stop = Number.isInteger(restore?.index)
      ? Math.min(restore.index, pdf.numPages - 1)
      : pageIndex;
    const thisPdf = pdf;
    // Crisp previews on dense screens, within roughly the same memory budget as the page canvas.
    const ratio = Math.max(
      1,
      Math.min(
        window.devicePixelRatio || 1,
        2,
        Math.sqrt(16000000 / (thisPdf.numPages * 112 * 158)),
      ),
    );
    thumbnailObserver = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          thumbnailObserver.unobserve(entry.target);
          const c = entry.target.querySelector('canvas');
          const index = Number(entry.target.dataset.index);
          thisPdf
            .getPage(index + 1)
            .then(async (page) => {
              if (destroyed || pdf !== thisPdf || !c.isConnected) return;
              const natural = page.getViewport({ scale: 1 });
              const v = page.getViewport({
                scale: Math.min(112 / natural.width, 158 / natural.height),
              });
              const rendered = el('canvas', {
                width: Math.max(1, Math.floor(v.width * ratio)),
                height: Math.max(1, Math.floor(v.height * ratio)),
              });
              try {
                await page.render({
                  canvasContext: rendered.getContext('2d'),
                  viewport: v,
                  transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
                  optionalContentConfigPromise: documentLayers || undefined,
                }).promise;
                if (destroyed || pdf !== thisPdf || !c.isConnected) return;
                paintCanvas(c, rendered, v);
              } finally {
                rendered.width = rendered.height = 0;
              }
              // PDF.js keeps every decoded picture of a rendered page until told otherwise,
              // which a scan's thumbnails would turn into gigabytes; the page on view keeps
              // its pictures for the next zoom, and cleanup() declines while a render runs.
              if (pdf === thisPdf && index !== pageIndex) page.cleanup();
            })
            .catch(() => {});
        }),
      { root: thumbnails, rootMargin: '150px' },
    );
    for (let i = 0; i < pdf.numPages; i++) {
      const b = el(
        'button',
        {
          type: 'button',
          class: 'thumbnail',
          'data-index': i,
          'aria-label': `转到第 ${i + 1} 页`,
          'aria-current': i === pageIndex ? 'page' : 'false',
          tabindex: i === stop && !restore?.menu ? 0 : -1,
          onclick: () => {
            // On narrow screens the panel overlays the page, so choosing a page dismisses it.
            if (window.matchMedia('(max-width: 760px)').matches) hideSidebar();
            navigate(i);
          },
        },
        el('div', { class: 'thumb-paper' }, canvases[i] || el('canvas', { 'aria-hidden': 'true' })),
        el('span', {}, String(i + 1)),
      );
      // Each page has its own menu, on a button beside it and on a right click.
      const menuButton = iconButton(
        `第 ${i + 1} 页操作`,
        'EllipsisVertical',
        (e) => {
          // Safari does not focus buttons on pointer activation. Give the menu a stable
          // return target so page operations can restore focus when thumbnails rebuild.
          e.currentTarget.focus({ preventScroll: true });
          openMenu({
            anchor: e.currentTarget,
            items: pageItems(i),
            label: `第 ${i + 1} 页`,
            align: 'auto',
            minWidth: 230,
          });
        },
        {
          class: 'icon-btn thumb-menu',
          'aria-haspopup': 'menu',
          'aria-expanded': 'false',
          tabindex: i === stop && restore?.menu ? 0 : -1,
        },
      );
      const item = el(
        'div',
        {
          class: 'thumb-item',
          'data-index': i,
          oncontextmenu: (e) => {
            e.preventDefault();
            openMenu({
              anchor: menuButton,
              items: pageItems(i),
              label: `第 ${i + 1} 页`,
              x: e.clientX,
              y: e.clientY,
              minWidth: 230,
            });
          },
        },
        b,
        menuButton,
      );
      thumbnails.append(item);
      thumbnailObserver.observe(b);
    }
    if (restore && Number.isInteger(restore.index)) {
      const item = thumbnails.children[Math.min(restore.index, pdf.numPages - 1)];
      item
        ?.querySelector(restore.menu ? '.thumb-menu' : '.thumbnail')
        ?.focus({ preventScroll: true });
    }
  }
  /**
   * The pages are one tab stop, however many there are: Up and Down move between them, Home
   * and End to the first and last, and Right and Left between a page and its menu button.
   */
  function setThumbnailStop(target) {
    if (!target || target.tabIndex === 0) return;
    for (const node of thumbnails.querySelectorAll('[tabindex="0"]')) node.tabIndex = -1;
    target.tabIndex = 0;
  }
  thumbnails.addEventListener('focusin', (e) =>
    setThumbnailStop(e.target.closest?.('.thumbnail, .thumb-menu')),
  );
  thumbnails.addEventListener('keydown', (e) => {
    const target = e.target.closest?.('.thumbnail, .thumb-menu');
    if (!target || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const item = target.closest('.thumb-item'),
      items = thumbnails.children,
      index = Number(item.dataset.index),
      menu = target.classList.contains('thumb-menu');
    let next;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp')
      next = items[index + (e.key === 'ArrowDown' ? 1 : -1)]?.querySelector(
        menu ? '.thumb-menu' : '.thumbnail',
      );
    else if (e.key === 'Home' || e.key === 'End')
      next = items[e.key === 'Home' ? 0 : items.length - 1]?.querySelector('.thumbnail');
    else if (e.key === 'ArrowRight' && !menu) next = item.querySelector('.thumb-menu');
    else if (e.key === 'ArrowLeft' && menu) next = item.querySelector('.thumbnail');
    else return;
    e.preventDefault();
    next?.focus();
  });
  // Pages can be dragged into a new order with a mouse or pen.
  const reorder = enableThumbnailReorder(thumbnails, {
    canDrag: () => !busy && pageReady && access().assemble,
    onMove: (from, to) => pageAction(() => movePageTo(from, to))(),
  });
  function clampPageIndex(index) {
    return Math.max(0, Math.min(pageCount - 1, Number.isFinite(index) ? Math.floor(index) : 0));
  }
  function navigateBy(direction) {
    const from = clampPageIndex(pendingNavigation?.index ?? pageIndex);
    // Side by side, the next or previous page is the first of the next or previous pair; the
    // other page of the pair on view is already in sight.
    if (stack.twoUp) {
      // From the first or last pair there is none to turn to.
      const pair = Math.floor(from / 2) + direction;
      if (pair < 0 || pair > Math.floor((pageCount - 1) / 2)) return false;
      return navigate(pair * 2);
    }
    return navigate(from + direction);
  }
  async function navigate(index, comment = null, { scroll = true } = {}) {
    if (destroyed || !pageCount) return false;
    // Resolve relative steps from the requested destination and let the latest choice
    // own the transition. The edit still belongs to its original page until it settles.
    const request = (pendingNavigation = { index: clampPageIndex(index) });
    navigationGeneration++;
    revealComment = null;
    cancelTextSelection();
    updateStatus();
    try {
      await idle();
      if (destroyed || pendingNavigation !== request) return false;
      await finishDrafts();
      if (destroyed || pendingNavigation !== request) return false;
      if (comment && tool !== 'select') {
        await setTool('select');
        if (destroyed || pendingNavigation !== request) return false;
      }
      // Register the comment's navigation before any draft commits or tool changes,
      // and reveal it only after those finish. A newer page choice retires both.
      revealComment = comment?.kind ? comment : null;
      if (comment && pageReady && pageIndex === clampPageIndex(request.index)) {
        await applyRevealComment();
        return !destroyed && pendingNavigation === request && pageReady;
      }
      // A page operation or undo may have changed the count while navigation waited.
      pageIndex = clampPageIndex(request.index);
      // A page chosen from the controls comes to the top; one reached by scrolling stays put.
      if (scroll) stack.scrollTo(pageIndex);
      updateStatus();
      await renderPage();
      return !destroyed && pendingNavigation === request && pageReady;
    } catch {
      return false;
    } finally {
      if (pendingNavigation === request) {
        pendingNavigation = null;
        updateStatus();
      }
    }
  }
  /**
   * Go to a destination's page and, when it names a place there, bring that place to the top
   * left of the view, as PDF readers do for bookmarks and links.
   */
  async function showDestination(target) {
    const placed = target.left != null || target.top != null;
    if ((target.page !== pageIndex || !placed) && !(await navigate(target.page))) return;
    if (!placed || destroyed || pageIndex !== target.page || !viewport) return;
    const [x0, , , y1] = viewport.viewBox;
    const [x, y] = viewport.convertToViewportPoint(target.left ?? x0, target.top ?? y1);
    const sheet = paper.getBoundingClientRect(),
      view = workspace.getBoundingClientRect();
    // On a page turned a quarter, the PDF's left and top run down and across the view.
    const turned = viewport.rotation % 180 !== 0;
    if ((turned ? target.left : target.top) != null)
      workspace.scrollTop += sheet.top + y - view.top;
    if ((turned ? target.top : target.left) != null)
      workspace.scrollLeft += sheet.left + x - view.left;
    stack.quiet();
  }
  async function toggleSidebar(show = editorRoot.classList.contains('hide-pages')) {
    // A docked panel changes the page's width, so open drafts are finished first; on narrow
    // screens it overlays the page and a draft carries on underneath.
    if (!window.matchMedia('(max-width: 760px)').matches)
      try {
        await finishDrafts();
      } catch {
        return;
      }
    const hadFocus = sidebar.contains(document.activeElement);
    if (
      show &&
      window.matchMedia('(max-width: 760px)').matches &&
      !editorRoot.classList.contains('hide-tools')
    )
      toggleToolsPanel(false);
    editorRoot.classList.toggle('hide-pages', !show);
    pagesButton.setAttribute('aria-expanded', String(show));
    // A control inside a panel that just closed would leave focus on nothing; hand it back to
    // the toggle that opens the panel again.
    if (!show && hadFocus) pagesButton.focus({ preventScroll: true });
    // A hidden panel could not scroll, so an opening one catches up with the current page.
    if (show) revealThumbnail();
    snapPaper();
    // Only a fit-width page whose workspace changed size needs another render: on narrow
    // screens the panel overlays the page, and a fixed zoom keeps its geometry either way.
    setTimeout(refitPage, 0);
  }
  /** Hide the panel without a re-render; as an overlay it does not change the page width. */
  function hideSidebar() {
    // A control chosen in the panel would leave focus on nothing; the page view takes it.
    if (sidebar.contains(document.activeElement)) workspace.focus({ preventScroll: true });
    editorRoot.classList.add('hide-pages');
    pagesButton.setAttribute('aria-expanded', 'false');
  }
  if (window.matchMedia('(max-width: 760px)').matches) hideSidebar();
  // The accessibility report has a tab once a check has run.
  sidebarTabs.querySelector('[data-tab="accessibility"]').hidden = true;
  // Scrolling through every page or one page (or spread) at a time, single pages or two side
  // by side; remembered on this device.
  const PAGE_DISPLAY_KEY = 'pdf-editor:page-display';
  const PAGE_DISPLAYS = {
    continuous: { continuous: true, twoUp: false },
    single: { continuous: false, twoUp: false },
    'two-continuous': { continuous: true, twoUp: true },
    two: { continuous: false, twoUp: true },
  };
  const pageDisplay = () =>
    Object.keys(PAGE_DISPLAYS).find(
      (key) =>
        PAGE_DISPLAYS[key].continuous === stack.continuous &&
        PAGE_DISPLAYS[key].twoUp === stack.twoUp,
    );
  function setPageDisplay(display, { remember = true } = {}) {
    const choice = PAGE_DISPLAYS[display] || PAGE_DISPLAYS.continuous;
    stack.setTwoUp(choice.twoUp);
    stack.setContinuous(choice.continuous);
    if (remember)
      try {
        if (display === 'continuous') localStorage.removeItem(PAGE_DISPLAY_KEY);
        else localStorage.setItem(PAGE_DISPLAY_KEY, display);
      } catch {
        /* The preference is optional. */
      }
    if (pdf) {
      safe(() => renderPage())();
      stack.scrollTo(pageIndex);
      stack.refresh();
    }
  }
  try {
    const stored = localStorage.getItem(PAGE_DISPLAY_KEY);
    if (PAGE_DISPLAYS[stored]) setPageDisplay(stored, { remember: false });
  } catch {
    /* The preference is optional. */
  }
  /** Read mode keeps only the pages and their controls on screen. */
  function setReadMode(on) {
    editorRoot.classList.toggle('read-mode', on);
    if (on)
      toast(
        // A touch screen usually has no Escape key.
        touchScreen?.matches
          ? '阅读模式。在“视图”菜单中将其关闭以再次显示工具。'
          : '阅读模式。按 Esc 键再次显示工具。',
      );
    setTimeout(refitPage, 0);
  }
  function toggleFullScreen() {
    const area = editorRoot.querySelector('.document-area');
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else area.requestFullscreen?.().catch(() => toast('当前环境不支持全屏。'));
  }
  const onFullscreen = () => {
    editorRoot.classList.toggle('full-screen', !!document.fullscreenElement);
    // Full screen shows the pages alone. A control left with the focus outside them (the View
    // menu's name, after choosing it there) would take the keys meant for reading on.
    const shown = document.fullscreenElement;
    if (shown && editorRoot.contains(shown) && !shown.contains(document.activeElement))
      workspace.focus({ preventScroll: true });
    setTimeout(refitPage, 50);
  };
  document.addEventListener('fullscreenchange', onFullscreen);
  // The Hand tool, or Space held with any tool, drags the pages around.
  let panning = null,
    spaceHeld = false;
  const canPanWithSpace = (e) =>
    !e.repeat &&
    !textEdit &&
    !noteEdit &&
    !e.target.isContentEditable &&
    !/input|textarea|select|button|puter-user-menu/i.test(e.target.tagName) &&
    !document.querySelector('dialog[open]');
  const onSpace = (e) => {
    if (e.code !== 'Space') return;
    if (e.type === 'keydown' && !spaceHeld && canPanWithSpace(e)) {
      spaceHeld = true;
      editorRoot.classList.add('space-pan');
      e.preventDefault();
    } else if (e.type === 'keyup' && spaceHeld) {
      spaceHeld = false;
      editorRoot.classList.remove('space-pan');
    }
  };
  // A Space released while another window has the focus never comes back as a keyup here.
  const releaseSpace = () => {
    spaceHeld = false;
    editorRoot.classList.remove('space-pan');
  };
  window.addEventListener('keydown', onSpace);
  window.addEventListener('keyup', onSpace);
  window.addEventListener('blur', releaseSpace);
  workspace.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0 || !(tool === 'hand' || spaceHeld)) return;
      e.preventDefault();
      e.stopPropagation();
      panning = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        left: workspace.scrollLeft,
        top: workspace.scrollTop,
      };
      workspace.setPointerCapture(e.pointerId);
      editorRoot.classList.add('panning');
    },
    true,
  );
  workspace.addEventListener('pointermove', (e) => {
    if (!panning || e.pointerId !== panning.id) return;
    workspace.scrollLeft = panning.left - (e.clientX - panning.x);
    workspace.scrollTop = panning.top - (e.clientY - panning.y);
  });
  const endPan = (e) => {
    if (!panning || e.pointerId !== panning.id) return;
    panning = null;
    editorRoot.classList.remove('panning');
  };
  workspace.addEventListener('pointerup', endPan);
  workspace.addEventListener('pointercancel', endPan);
  // Below desktop widths the tools pane overlays the page, so it starts closed there.
  if (window.matchMedia('(max-width: 1000px)').matches) editorRoot.classList.add('hide-tools');
  syncTopTabs();
  // A window narrowed past those widths while open (a tablet turned upright, a window snapped
  // to half the screen) closes the panels that would now lie over the page, as they start
  // closed there; otherwise the two together left only a sliver of the page in view.
  const overlaidTools = window.matchMedia('(max-width: 1000px)'),
    overlaidPages = window.matchMedia('(max-width: 760px)');
  const onOverlaidTools = (e) => {
    if (e.matches && !editorRoot.classList.contains('hide-tools')) toggleToolsPanel(false);
  };
  const onOverlaidPages = (e) => {
    if (e.matches && !editorRoot.classList.contains('hide-pages')) hideSidebar();
  };
  overlaidTools.addEventListener('change', onOverlaidTools);
  overlaidPages.addEventListener('change', onOverlaidPages);
  async function mutate(
    operation,
    message,
    permission = 'edit',
    { signal, canCommit, onCommit, retainScale = false } = {},
  ) {
    if (busy || destroyed) return;
    requireAccess(...(Array.isArray(permission) ? permission : [permission]));
    if (!(await confirmSignedEdit()) || busy || destroyed) return;
    const retainedScale = retainScale
      ? { page: pageIndex, mode: scaleMode, request: pendingZoom }
      : null;
    busy = true;
    updateStatus();
    try {
      const previousPage = pageIndex;
      try {
        if (
          (await session.change(operation, {
            signal,
            canCommit,
            streamProtection: protection?.original,
            saveOptions: pdfaClaim?.part === 1 ? { useObjectStreams: false } : undefined,
          })) === false
        )
          return;
      } catch (error) {
        pageIndex = previousPage;
        throw error;
      }
      onCommit?.();
      await reload(retainedScale);
      if (message && !destroyed) toast(message);
    } finally {
      busy = false;
      updateStatus();
      organizer.updateState();
    }
  }
  /** Keep a dialog edit local until it succeeds; closing the dialog abandons pending work. */
  async function mutateDialog(dialog, operation, message, permission = 'edit') {
    if (busy || destroyed || !dialog.open) return false;
    let committed = false;
    const controller = new AbortController();
    const abort = () => controller.abort();
    dialog.addEventListener('close', abort, { once: true });
    dialogController.signal.addEventListener('abort', abort, { once: true });
    const controls = [
      ...dialog.querySelectorAll('input, select, textarea, .dialog-actions .primary'),
    ].map((control) => ({ control, disabled: control.disabled }));
    // Disabling the focused control drops the focus; a dialog left open (the edit failed, a
    // header too wide, say) gives it back so the keyboard is still where it was.
    const focused = dialog.contains(document.activeElement) ? document.activeElement : null;
    controls.forEach(({ control }) => {
      control.disabled = true;
    });
    dialog.setAttribute('aria-busy', 'true');
    try {
      await mutate(operation, message, permission, {
        signal: controller.signal,
        // Native close events are queued; the open flag changes synchronously.
        canCommit: () => dialog.open && !destroyed,
        onCommit: () => {
          committed = true;
          // Once committed, close before redrawing so Cancel never offers to undo a saved edit.
          dialog.removeEventListener('close', abort);
          if (dialog.open) dialog.close();
        },
      });
      if (dialog.open) dialog.close();
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    } finally {
      dialog.removeEventListener('close', abort);
      dialogController.signal.removeEventListener('abort', abort);
      dialog.removeAttribute('aria-busy');
      controls.forEach(({ control, disabled }) => {
        control.disabled = disabled;
      });
      if (
        dialog.open &&
        focused?.isConnected &&
        !focused.disabled &&
        !dialog.contains(document.activeElement)
      )
        focused.focus();
    }
    return committed;
  }
  let historyTail = Promise.resolve(),
    pendingHistory = 0;
  function history(action) {
    // Keyboard commands can arrive while a previous edit or history step redraws the PDF.
    // Preserve their order, including mixed Undo/Redo, and let output wait for the queue.
    pendingHistory++;
    const task = historyTail
      .then(async () => {
        await idle(false);
        if (!destroyed) await applyHistory(action);
      })
      .finally(() => pendingHistory--);
    // A failed step is reported by its caller, but must not poison later commands.
    historyTail = task.catch(() => {});
    return task;
  }
  async function applyHistory(action) {
    if (action === 'undo' && (pageImages.dirty || pageImages.active)) {
      pageImages.cancel();
      return;
    }
    // The draft held the focus when undone from the keyboard; the page takes it then. A pressed
    // Undo button keeps it, also once it has nothing more to undo (see setStepOff).
    const focusPage = () => {
      if (document.activeElement !== undoButton || undoButton.disabled) overlay.focus();
    };
    if (action === 'undo' && pendingTextEdit()) {
      await finishTextEdit(false);
      focusPage();
      return;
    }
    // A note being typed is undone by discarding the draft, as text is; committing it first
    // would only put the unwanted note on the redo stack.
    if (action === 'undo' && pendingNoteEdit()) {
      closeNoteEditor();
      focusPage();
      return;
    }
    // The Redo button is disabled while a draft is pending; the shortcut must match it
    // instead of committing the draft as a side effect.
    if (action === 'redo' && (pendingTextEdit() || pendingNoteEdit() || pageImages.dirty)) return;
    if (pageForms[action]()) return;
    if (pageForms.draft.dirty) return;
    await finishDrafts();
    if (session[action]()) {
      // Pressed from the keyboard, the button is disabled while the PDF is redrawn, which drops
      // the focus; it takes it back for the next press unless the focus has moved meanwhile.
      const pressed = [undoButton, redoButton].find((b) => b === document.activeElement);
      // A selected picture's or shape's handle goes with the redrawn page; the page keeps the
      // focus then, as it does when a draft is undone.
      const onObject = pageImages.controls.contains(document.activeElement);
      busy = true;
      updateStatus();
      try {
        await reload();
      } finally {
        busy = false;
        updateStatus();
        if (pressed && !pressed.disabled && document.activeElement === document.body)
          pressed.focus({ preventScroll: true });
        else if (onObject && !destroyed && document.activeElement === document.body)
          overlay.focus({ preventScroll: true });
      }
    }
  }
  async function setTool(next) {
    const permission = toolPermission(next);
    if (permission) requireAccess(permission);
    cancelTextSelection();
    await finishDrafts();
    tool = next;
    selectedHighlight = null;
    gesture = null;
    discardCropDraft();
    clearOverlay();
    toolButtons.forEach((b, id) => b.setAttribute('aria-pressed', String(id === tool)));
    const passive = tool === 'select' || tool === 'hand';
    overlay.classList.toggle('active', !passive);
    overlay.tabIndex = passive ? -1 : 0;
    textTargets.hidden = !['text', 'select'].includes(tool);
    textTargets.classList.toggle('select-text-objects', tool === 'select');
    pageForms.setEnabled(tool === 'select' && !preparing);
    pageImages.setEnabled(tool === 'select' && access().edit);
    renderHighlightTargets();
    renderNoteTargets();
    renderLinkTargets();
    annotationLayer.setEnabled(tool === 'select');
    toolOptions.hidden = tool === 'select' || tool === 'hand';
    widthInput.hidden = !['shape', 'ink', 'cshape', 'pencil'].includes(tool);
    shapeSelect.hidden = tool !== 'shape';
    commentShape.hidden = tool !== 'cshape';
    measureMode.hidden = measureUnit.hidden = measureRatio.hidden = tool !== 'measure';
    measurePath = [];
    sizeInput.hidden = !['text', 'textbox', 'callout'].includes(tool);
    sizeInput.value = String(['textbox', 'callout'].includes(tool) ? commentSize : textSize);
    boldButton.hidden = italicButton.hidden = tool !== 'text';
    syncStyleButtons();
    centerButton.hidden = UNPLACEABLE.includes(tool);
    colorInput.hidden = ['crop', 'link', 'certsign', 'field'].includes(tool);
    cropMarginsButton.hidden = cropDoneButton.hidden = tool !== 'crop';
    color = toolColors[colorGroup()];
    colorInput.value = color;
    highlightMode.hidden = tool !== 'highlight';
    markupKind.hidden = tool !== 'highlight' || markupKind.value === 'redact';
    highlightButton.hidden = tool !== 'highlight' || highlightArea();
    hint.textContent = {
      select: selectHint(),
      text: '单击已有文本进行编辑，或单击空白区域添加文本。',
      highlight: '先选中文本，再选择“高亮选中内容”。扫描页请使用“区域”。',
      ink: '用鼠标、手写笔或触摸在页面上绘制。',
      shape: SHAPE_HINTS[shapeSelect.value],
      note: '单击放置便签的位置，或单击已有便签进行查看或编辑。',
      crop: '拖动选择要保留的页面区域，然后选择要裁剪的页面。',
      link: '拖动选择用于打开网址或其他页面的文本或区域。',
      hand: '拖动以浏览页面。使用任何工具时按住空格键也可平移。',
      certsign: '拖动框选签名出现的位置，或单击空的签名域。',
      textbox: '拖动框选文本批注区域，或单击放置。',
      callout: '从批注指向的位置拖动到批注框的位置。',
      cshape: '拖动绘制形状。按住 Shift 可保持规则形状。',
      pencil: '在页面上绘制；每一笔都会成为可移动或删除的批注。',
      measure: measureHint(),
      field:
        '拖动框选表单域位置，或单击放置。拖动表单域可移动；双击可打开其属性。',
    }[tool];
    hint.textContent = forPointer(hint.textContent);
    syncStyleButtons();
    if (redacting()) {
      hint.textContent =
        '先选中文本，再选择“标记选中内容以密文”。选择“区域”可拖动框选图片或页面任意部分。';
      colorInput.hidden = true;
    }
    toolsPanel.refresh();
    editorRoot.dataset.tool = tool;
    if (tool === 'highlight') updateHighlightMode();
    else clearHighlightSelection();
    const unindexed =
      (['text', 'select'].includes(tool) && access().edit && !textRunCache.has(pageIndex)) ||
      (tool === 'select' && !imageRunCache.has(pageIndex));
    if (!pageReady || !currentPage) {
      // A render in flight reads the tool once it reaches indexing; restart it as before.
      if (unindexed) await renderPage();
      else renderTextTargets();
      return;
    }
    // The rendered page stays in place: indexing needs the PDF, not another canvas paint.
    const token = pageRenderGeneration;
    if (['text', 'select'].includes(tool) && access().edit) {
      if (!(await indexTextRuns(currentPage, token))) return;
      textRuns = textRunCache.get(pageIndex) || [];
    }
    if (tool === 'select' && !imageRunCache.has(pageIndex)) {
      if (!(await indexPageObjects(token))) return;
      pageImages.render(
        imageRunCache.get(pageIndex) || [],
        viewport,
        `${session.revision}:${pageIndex}`,
        pageIndex,
      );
      pageImages.setEnabled(tool === 'select' && access().edit);
    }
    renderTextTargets();
    updateStatus();
  }
  function updateHighlightMode() {
    const area = highlightArea();
    overlay.classList.toggle('active', area);
    overlay.tabIndex = area ? 0 : -1;
    highlightButton.hidden = area;
    // Redaction marks share this tool; their hint names their own command.
    hint.textContent = redacting()
      ? area
        ? '拖动框选区域以标记为密文。'
        : '先选中文本，再选择“标记选中内容以密文”。选择“区域”可拖动框选图片或页面任意部分。'
      : area
        ? '拖动框选区域以高亮。'
        : '先选中文本，再选择“高亮选中内容”。扫描页请使用“区域”。';
    if (area) {
      if (highlightSelection || highlightCaptureTimer) window.getSelection()?.removeAllRanges();
      clearHighlightSelection();
    } else captureHighlightSelection();
  }
  /**
   * Select the page's own words. In a PDF reader Select All means the text on the page, not
   * the application around it, which is what the browser's own command would reach for.
   * Returns whether the page had any text to select.
   */
  function selectPageText() {
    const selection = window.getSelection();
    if (!selection || !pageReady || !textContainer.firstChild) return false;
    const range = document.createRange();
    range.selectNodeContents(textContainer);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }
  let highlightCaptureTimer = null;
  function clearHighlightSelection() {
    clearTimeout(highlightCaptureTimer);
    highlightCaptureTimer = null;
    highlightSelection = null;
    highlightButton.disabled = true;
  }
  /** Read the selected glyph geometry now. */
  function measureHighlightSelection() {
    clearTimeout(highlightCaptureTimer);
    highlightCaptureTimer = null;
    highlightSelection = selectedTextQuads(textLayer, viewport, paper);
    highlightButton.disabled = !highlightSelection;
  }
  function captureHighlightSelection() {
    if (tool !== 'highlight' || highlightArea() || busy || !pageReady) return;
    if (!pageTextRange(textContainer)) {
      clearHighlightSelection();
      return;
    }
    // Measuring a dense selection still reads many glyph rectangles. Enable the action
    // at once and read the geometry after the selection settles.
    clearTimeout(highlightCaptureTimer);
    highlightSelection = null;
    highlightButton.disabled = false;
    highlightCaptureTimer = setTimeout(measureHighlightSelection, 100);
  }
  async function applyHighlight() {
    if (highlightCaptureTimer) measureHighlightSelection();
    if (!highlightSelection || busy || !pageReady) return;
    const selection = highlightSelection;
    await mutate(
      async (doc) => {
        if (markupKind.value !== 'redact')
          return addHighlight(doc, pageIndex, {
            ...selection,
            hex: color,
            kind: markupKind.value,
            author: getUser()?.username || '',
          });
        // On the selected glyphs: the selection's line boxes can reach into the next line.
        const { addRedactionMarks, selectionRedactionRects } = await loadRedaction();
        const rects = await selectionRedactionRects(doc, pageIndex, selection.quads);
        return addRedactionMarks(doc, pageIndex, rects, redactionStyle);
      },
      null,
      markupKind.value === 'redact' ? 'edit' : 'annotate',
    );
    window.getSelection()?.removeAllRanges();
    clearHighlightSelection();
  }
  document.addEventListener('selectionchange', captureHighlightSelection);
  // A text selection dragged off the page runs to the page's last (or first) word. Left to
  // itself, the browser maps the empty space below the last page back to where the drag began.
  let textDragPointer = null;
  textContainer.addEventListener('pointerdown', (e) => {
    if (e.button === 0 && e.pointerType !== 'touch') textDragPointer = e.pointerId;
  });
  function endTextDrag(e) {
    if (e.pointerId === textDragPointer) textDragPointer = null;
  }
  function followTextDrag(e) {
    if (e.pointerId !== textDragPointer) return;
    const { clientX: x, clientY: y } = e;
    // After the browser has placed the selection for this move.
    requestAnimationFrame(() => {
      const selection = window.getSelection();
      if (!selection?.anchorNode || !textContainer.contains(selection.anchorNode)) return;
      const box = paper.getBoundingClientRect();
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return;
      const after = y > box.bottom || (x > box.right && y >= box.top);
      selection.extend(textContainer, after ? textContainer.childNodes.length : 0);
    });
  }
  document.addEventListener('pointermove', followTextDrag, true);
  document.addEventListener('pointerup', endTextDrag, true);
  document.addEventListener('pointercancel', endTextDrag, true);
  /** Delete a markup, from its Delete button or the Delete key; `control` takes focus back. */
  async function deleteHighlight(entry, control) {
    try {
      await finishDrafts();
      await mutate(
        (doc) => editHighlight(doc, pageIndex, entry.id, { remove: true }),
        null,
        'annotate',
      );
    } catch (error) {
      if (!destroyed && control.isConnected && document.activeElement === document.body)
        control.focus({ preventScroll: true });
      throw error;
    }
    if (!destroyed && document.activeElement === document.body) overlay.focus();
  }
  /** The Delete and Backspace keys delete a markup, as they delete other comments. */
  const deleteHighlightKey = (entry) => (e) => {
    if (!['Delete', 'Backspace'].includes(e.key) || e.repeat || !access().annotate) return;
    e.preventDefault();
    const control = e.currentTarget;
    safe(() => deleteHighlight(entry, control))();
  };
  function renderHighlightTargets() {
    highlightTargets.hidden = tool !== 'select';
    highlightTargets.replaceChildren();
    properties.clear('highlight');
    if (tool !== 'select' || !viewport) return;
    for (const entry of highlights) {
      if (entry.readOnly) continue;
      const label = MARKUP_KINDS[entry.kind].label;
      entry.quads.forEach((quad, i) => {
        const points = [];
        for (let j = 0; j < 8; j += 2)
          points.push(viewport.convertToViewportPoint(quad[j], quad[j + 1]));
        const xs = points.map((p) => p[0]),
          ys = points.map((p) => p[1]);
        const x = Math.min(...xs),
          y = Math.min(...ys),
          w = Math.max(...xs) - x,
          h = Math.max(...ys) - y;
        const target = el('button', {
          class: 'highlight-target',
          type: 'button',
          'aria-label': `Edit ${label}${entry.text ? ': ' + entry.text.slice(0, 80) : ''}${i ? ` (part ${i + 1})` : ''}`,
          'aria-pressed': selectedHighlight?.id === entry.id,
          'data-highlight-id': entry.id,
          disabled: !access().annotate,
          onkeydown: deleteHighlightKey(entry),
          onclick: safe(() =>
            selectionProperties(async () => {
              if (busy || !pageReady) return;
              const focusFrom = document.activeElement;
              cancelTextSelection();
              const ordinal = highlights.indexOf(entry);
              await finishDrafts();
              pageImages.close();
              annotationLayer.clear();
              // Finishing a related note may detach this reply and assign it a new ID.
              selectedHighlight = highlights.find((h) => h.id === entry.id) || highlights[ordinal];
              renderHighlightTargets();
              if (canFocusSelection(focusFrom))
                properties.root
                  .querySelector('.highlight-edit-panel input')
                  ?.focus({ preventScroll: true });
            }),
          ),
        });
        Object.assign(target.style, {
          left: `${x}px`,
          top: `${y}px`,
          width: `${w}px`,
          height: `${h}px`,
          clipPath: `polygon(${[0, 1, 3, 2].map((j) => `${points[j][0] - x}px ${points[j][1] - y}px`).join(',')})`,
        });
        highlightTargets.append(target);
      });
    }
    if (!selectedHighlight || !access().annotate) return;
    const entry = selectedHighlight,
      label = MARKUP_KINDS[entry.kind].label,
      Label = label[0].toUpperCase() + label.slice(1);
    const picker = el('input', {
      type: 'color',
      value: entry.hex,
      'aria-label': `${Label} color`,
      'data-markup-mutation': '',
      onkeydown: deleteHighlightKey(entry),
      onchange: safe((e) =>
        selectionProperties(async () => {
          if (busy || !pageReady) return;
          const hex = e.target.value;
          try {
            // Typed field values must land in the PDF before the reload that follows the edit.
            await finishDrafts();
            let editedId = entry.id;
            await mutate(
              (doc) => {
                const changed = editHighlight(doc, pageIndex, entry.id, { hex });
                if (typeof changed === 'string') editedId = changed;
                return changed;
              },
              null,
              'annotate',
              { retainScale: true },
            );
            // The reload cleared the selection; keep the highlight selected, as the object panels
            // do, so the color can be adjusted again or the highlight deleted without reselecting.
            if (destroyed || tool !== 'select' || selectedHighlight) return;
            selectedHighlight = highlights.find((h) => h.id === editedId) || null;
            if (!selectedHighlight || !access().annotate) return;
            renderHighlightTargets();
            if (document.activeElement === document.body)
              properties.root
                .querySelector('.highlight-edit-panel input')
                ?.focus({ preventScroll: true });
          } catch (error) {
            picker.value = entry.hex;
            if (!destroyed && picker.isConnected && document.activeElement === document.body)
              picker.focus({ preventScroll: true });
            throw error;
          }
        }),
      ),
    });
    const panel = el(
      'div',
      { class: 'highlight-edit-panel', role: 'group', 'aria-label': `Edit ${label}` },
      picker,
      button(
        `Delete ${label}`,
        'Trash2',
        safe((e) => deleteHighlight(entry, e.currentTarget)),
        'text-btn',
        { 'data-markup-mutation': '' },
      ),
      iconButton(`Close ${label} editor`, 'X', closeHighlightEditor),
    );
    // Its replies and review status, as every other comment shows them.
    const found = threadOf(entry.id);
    const thread =
      found &&
      commentThread(found, (operation, message, control) =>
        changeHighlightThread(entry, operation, message, control),
      );
    // Who marked it, when, and what they wrote: a markup's words were shown nowhere in full.
    const date = found?.modified ?? found?.created;
    const meta = [
      found?.author,
      date?.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    ]
      .filter(Boolean)
      .join(' · ');
    const words = entry.text.trim();
    properties.show(
      'highlight',
      Label,
      thread || meta || words
        ? el(
            'div',
            { class: 'annotation-props' },
            meta ? el('p', { class: 'muted annotation-meta' }, meta) : null,
            words ? el('p', { class: 'markup-comment' }, words) : null,
            panel,
            thread && thread.status,
            thread && thread.replies,
            thread && thread.replyText,
            thread && el('div', { class: 'annotation-actions' }, thread.replyButton),
          )
        : panel,
    );
  }
  /** Reply to the selected markup or set its status, keeping it selected afterwards. */
  async function changeHighlightThread(entry, operation, message, control) {
    await finishDrafts();
    await mutate((doc) => operation(doc, entry.id), message, 'annotate', { retainScale: true });
    if (destroyed || tool !== 'select' || selectedHighlight) return;
    selectedHighlight = highlights.find((h) => h.id === entry.id) || null;
    if (!selectedHighlight) return;
    renderHighlightTargets();
    properties.root.querySelector(`[aria-label="${control}"]`)?.focus({ preventScroll: true });
  }
  /** The selected markup's or note's panel as left, for a redraw of the page that clears it. */
  function heldSelection() {
    const kind = selectedHighlight ? 'highlight' : noteEdit?.entry ? 'note' : null;
    if (!kind) return null;
    const active = document.activeElement;
    const held = properties.root.contains(active) ? active : null;
    const targets = kind === 'note' ? noteTargets : highlightTargets;
    return {
      kind,
      id: kind === 'note' ? noteEdit.entry.id : selectedHighlight.id,
      page: pageIndex,
      reply: properties.root.querySelector('[aria-label="回复内容"]')?.value ?? '',
      label: held?.getAttribute('aria-label'),
      // Or its place on the page, when that has the keyboard.
      target: targets.contains(active) ? [...targets.children].indexOf(active) : -1,
      range:
        typeof held?.selectionStart === 'number'
          ? [held.selectionStart, held.selectionEnd, held.selectionDirection]
          : null,
    };
  }
  /** Select the markup or note again after a zoom, with the reply being typed and the keyboard. */
  async function restoreSelection(held) {
    if (!held || destroyed || pageIndex !== held.page || selectedHighlight || noteEdit) return;
    if (held.kind === 'note') {
      const entry = notes.find((note) => note.id === held.id);
      if (!entry || !['select', 'note'].includes(tool)) return;
      await openNoteEditor({ entry, canFocus: () => false });
      if (destroyed || noteEdit?.entry?.id !== held.id) return;
    } else {
      if (tool !== 'select') return;
      selectedHighlight = highlights.find((h) => h.id === held.id) || null;
      if (!selectedHighlight) return;
      renderHighlightTargets();
    }
    const reply = properties.root.querySelector('[aria-label="回复内容"]');
    if (reply && held.reply) reply.value = held.reply;
    // Saving the note's words handed the keyboard to the page meanwhile.
    if (!canFocusSelection(null)) return;
    const targets = held.kind === 'note' ? noteTargets : highlightTargets;
    if (held.target >= 0) targets.children[held.target]?.focus({ preventScroll: true });
    if (!held.label) return;
    const control = [...properties.root.querySelectorAll('[aria-label]')].find(
      (node) => node.getAttribute('aria-label') === held.label,
    );
    control?.focus({ preventScroll: true });
    if (held.range && typeof control?.selectionStart === 'number')
      control.setSelectionRange(...held.range);
  }
  function closeHighlightEditor() {
    const id = selectedHighlight?.id;
    selectedHighlight = null;
    renderHighlightTargets();
    [...highlightTargets.querySelectorAll('button')]
      .find((button) => button.dataset.highlightId === id)
      ?.focus({ preventScroll: true });
  }
  /**
   * Scroll the workspace as little as it takes to show an editor: the whole of `nodes`
   * together when they fit, and the first of them when they do not.
   */
  function revealEditor(...nodes) {
    const boxes = nodes.filter(Boolean).map((node) => node.getBoundingClientRect());
    if (!boxes.length) return;
    const view = workspace.getBoundingClientRect();
    const pad = 8;
    // The distance that brings [start, end] into [from, to], preferring the start edge.
    const shift = (start, end, from, to) => {
      if (start < from) return start - from;
      if (end > to) return Math.min(end - to, start - from);
      return 0;
    };
    const span = (pick) => {
      const all = boxes.map(pick);
      return [Math.min(...all.map((b) => b[0])), Math.max(...all.map((b) => b[1]))];
    };
    const fit = (pick, from, to) => {
      const [start, end] = span(pick);
      if (end - start <= to - from) return shift(start, end, from, to);
      const [only] = [pick(boxes[0])];
      return shift(only[0], only[1], from, to);
    };
    workspace.scrollLeft += fit((b) => [b.left, b.right], view.left + pad, view.right - pad);
    workspace.scrollTop += fit((b) => [b.top, b.bottom], view.top + pad, view.bottom - pad);
  }
  function clearOverlay() {
    const ctx = overlay.getContext('2d');
    ctx.resetTransform();
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    return ctx;
  }
  const screenPoint = (e) => {
    const r = overlay.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(viewport.width, ((e.clientX - r.left) * viewport.width) / r.width)),
      y: Math.max(0, Math.min(viewport.height, ((e.clientY - r.top) * viewport.height) / r.height)),
    };
  };
  const pdfPoint = (p) => {
    const [x, y] = viewport.convertToPdfPoint(p.x, p.y);
    return { x, y };
  };
  /** Screen units per PDF unit on the page as shown. */
  const screenUnit = () => {
    const [ax, ay] = viewport.convertToViewportPoint(0, 0),
      [bx, by] = viewport.convertToViewportPoint(1, 0);
    return Math.hypot(bx - ax, by - ay);
  };
  /**
   * The PDF rectangle `width` by `height` units that runs right and down from screen point `p`
   * as the page is shown, so a box keeps its shape on a turned page.
   */
  const readerRect = (p, width, height) => {
    const unit = screenUnit();
    return normalizeRect(pdfPoint(p), pdfPoint({ x: p.x + width * unit, y: p.y + height * unit }));
  };
  /** readerRect, moved back as far as it takes to fit on the page: a click by the edge. */
  const readerRectOnPage = (p, width, height) => {
    const unit = screenUnit();
    const fit = (at, size, room) => Math.max(0, Math.min(at, room - size * unit));
    return readerRect(
      { x: fit(p.x, width, viewport.width), y: fit(p.y, height, viewport.height) },
      width,
      height,
    );
  };
  overlay.addEventListener('pointerdown', (e) => {
    if (busy || !pageReady || gesture || !e.isPrimary || tool === 'select' || e.button !== 0)
      return;
    e.preventDefault();
    const p = screenPoint(e);
    if (tool === 'note') {
      if (noteEdit) {
        safe(deselectObjects)();
        return;
      }
      safe(() => openNoteEditor({ point: p }))();
      return;
    }
    if (tool === 'text') {
      if (textEdit) {
        safe(deselectObjects)();
        return;
      }
      const overText = textLayer?.textDivs.some((node) => {
        const r = node.getBoundingClientRect();
        return (
          node.textContent.trim() &&
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom
        );
      });
      if (overText) {
        toast('此文本暂无法编辑。请选择空白区域以添加文本。');
        return;
      }
      safe(() => textDialog(p))();
      return;
    }
    if (tool === 'crop') discardCropDraft();
    if (tool === 'measure' && measureMode.value !== 'distance') {
      // Corners clicked on another page are no part of this one.
      if (measurePage !== pageIndex) measurePath = [];
      measurePath.push(pdfPoint(p));
      measurePage = pageIndex;
      drawMeasurePath(p);
      return;
    }
    gesture = {
      pointerId: e.pointerId,
      event: e,
      start: p,
      points: [p],
      type: tool,
      kind: markupKind.value,
      shape:
        tool === 'cshape'
          ? { square: 'rectangle', circle: 'ellipse', cloud: 'rectangle' }[commentShape.value] ||
            commentShape.value
          : shapeSelect.value,
      commentKind: commentShape.value,
      hex: color,
      width: stroke / viewport.userUnit,
      page: pageIndex,
    };
    overlay.setPointerCapture(e.pointerId);
  });
  /** With Shift held, rectangles and ellipses stay regular and lines snap to 45 degrees. */
  function constrainShape(start, end, shape, shift) {
    if (!shift) return end;
    const dx = end.x - start.x,
      dy = end.y - start.y;
    if (shape === 'line' || shape === 'arrow') {
      const length = Math.hypot(dx, dy),
        angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      return { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length };
    }
    const side = Math.min(Math.abs(dx), Math.abs(dy));
    return { x: start.x + Math.sign(dx) * side, y: start.y + Math.sign(dy) * side };
  }
  function previewShape(ctx, shape, a, b) {
    const r = normalizeRect(a, b),
      head =
        shape === 'arrow' ? arrowHead(a, b, ctx.lineWidth, 8 * zoom * viewport.userUnit) : null;
    ctx.beginPath();
    if (shape === 'ellipse')
      ctx.ellipse(
        r.x + r.width / 2,
        r.y + r.height / 2,
        r.width / 2,
        r.height / 2,
        0,
        0,
        2 * Math.PI,
      );
    else if (shape === 'line' || shape === 'arrow') {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(head?.base.x ?? b.x, head?.base.y ?? b.y);
    } else if (shape === 'check' || shape === 'cross') {
      // Screen space runs downwards, so the mark's box is mirrored from the page version.
      const at = (fx, fy) => [r.x + r.width * fx, r.y + r.height * (1 - fy)];
      if (shape === 'check') {
        ctx.moveTo(...at(0.12, 0.52));
        ctx.lineTo(...at(0.4, 0.18));
        ctx.lineTo(...at(0.9, 0.86));
      } else {
        ctx.moveTo(...at(0.15, 0.85));
        ctx.lineTo(...at(0.85, 0.15));
        ctx.moveTo(...at(0.15, 0.15));
        ctx.lineTo(...at(0.85, 0.85));
      }
    } else ctx.rect(r.x, r.y, r.width, r.height);
    ctx.stroke();
    if (head) {
      ctx.beginPath();
      ctx.moveTo(head.tip.x, head.tip.y);
      ctx.lineTo(head.left.x, head.left.y);
      ctx.lineTo(head.right.x, head.right.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  function updateDrawingGesture(e) {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    gesture.event = e;
    const p =
      gesture.type === 'shape' || gesture.type === 'cshape'
        ? constrainShape(gesture.start, screenPoint(e), gesture.shape, e.shiftKey)
        : screenPoint(e);
    gesture.end = p;
    if (gesture.type === 'ink' || gesture.type === 'pencil') {
      const last = gesture.points.at(-1);
      if (p.x !== last.x || p.y !== last.y) gesture.points.push(p);
    }
    const ctx = clearOverlay();
    ctx.setTransform(overlay.width / viewport.width, 0, 0, overlay.height / viewport.height, 0, 0);
    ctx.strokeStyle = gesture.hex;
    ctx.fillStyle = gesture.hex;
    ctx.lineWidth = gesture.width * zoom * viewport.userUnit;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (gesture.type === 'crop') drawCropPreview(ctx, normalizeRect(gesture.start, p));
    else if (['link', 'certsign', 'field'].includes(gesture.type)) {
      const r = normalizeRect(gesture.start, p);
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();
      ctx.globalAlpha = 0.18;
      ctx.fillRect(r.x, r.y, r.width, r.height);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--brand')
        .trim();
      ctx.lineWidth = 1.5;
      ctx.strokeRect(r.x, r.y, r.width, r.height);
    } else if (gesture.type === 'ink' || gesture.type === 'pencil') {
      ctx.beginPath();
      gesture.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    } else {
      const r = normalizeRect(gesture.start, p);
      if (gesture.type === 'highlight') {
        ctx.globalAlpha = 0.32;
        ctx.fillRect(r.x, r.y, r.width, r.height);
        ctx.globalAlpha = 1;
      } else if (gesture.type === 'measure') {
        previewShape(ctx, 'line', gesture.start, p);
        hint.textContent = measureLabel('distance', [pdfPoint(gesture.start), pdfPoint(p)], {
          ...measureScale,
          userUnit: viewport.userUnit,
        });
      } else if (gesture.type === 'textbox') previewShape(ctx, 'rectangle', gesture.start, p);
      else if (gesture.type === 'callout') previewShape(ctx, 'arrow', p, gesture.start);
      else previewShape(ctx, gesture.shape, gesture.start, p);
    }
  }
  overlay.addEventListener('pointermove', updateDrawingGesture);
  function updateDrawingModifier(e) {
    if (e.key !== 'Shift' || !['shape', 'cshape'].includes(gesture?.type) || e.isComposing) return;
    const { pointerId, clientX, clientY } = gesture.event;
    updateDrawingGesture({ pointerId, clientX, clientY, shiftKey: e.shiftKey });
  }
  window.addEventListener('keydown', updateDrawingModifier);
  window.addEventListener('keyup', updateDrawingModifier);
  async function commitDrawing(operation, permission = 'edit') {
    // Keep the released stroke visible until renderPage paints the PDF and resets
    // the overlay in the same task. Also discard it if saving or rendering fails.
    committingDrawing = true;
    try {
      await mutate(operation, null, permission);
    } finally {
      committingDrawing = false;
      clearOverlay();
    }
  }
  overlay.addEventListener(
    'pointerup',
    safe(async (e) => {
      if (!gesture || e.pointerId !== gesture.pointerId) return;
      const g = gesture;
      updateDrawingGesture(e);
      gesture = null;
      if (COMMENT_TOOLS.includes(g.type)) {
        clearOverlay();
        // A comment shape keeps the Shift constraint its preview showed.
        const end =
          g.type === 'cshape'
            ? constrainShape(g.start, screenPoint(e), g.shape, e.shiftKey)
            : screenPoint(e);
        await placeComment(g, end);
      } else if (g.type === 'field') {
        clearOverlay();
        const end = screenPoint(e);
        if (Math.hypot(end.x - g.start.x, end.y - g.start.y) >= 8)
          await createField(normalizeRect(pdfPoint(g.start), pdfPoint(end)), g.page);
        else {
          // A click places a field of the usual size there, as a drag sizes one: a box
          // centered on the point, other fields starting at it, and all on the page.
          // The usual size is in points; a page with large units (UserUnit) needs fewer of them.
          const [width, height] = (
            ['checkbox', 'radio'].includes(fieldType) ? [14, 14] : [160, 22]
          ).map((points) => points / viewport.userUnit);
          const unit = screenUnit();
          const centered = width === height;
          const at = (value, size, room) =>
            Math.max(0, Math.min(value - (centered ? size / 2 : 0), room - size));
          const start = {
            x: at(g.start.x, width * unit, viewport.width),
            y: at(g.start.y, height * unit, viewport.height),
          };
          await createField(readerRect(start, width, height), g.page);
        }
      } else if (g.type === 'certsign') {
        clearOverlay();
        const end = screenPoint(e);
        if (Math.hypot(end.x - g.start.x, end.y - g.start.y) < 8) {
          // A click on a signature field the form left empty signs that field.
          const empty = await emptySignatureField(g.page, pdfPoint(end));
          if (empty) await signWithCertificate({ fieldName: empty.name, page: g.page });
          return;
        }
        await signWithCertificate({
          rect: normalizeRect(pdfPoint(g.start), pdfPoint(end)),
          page: g.page,
        });
      } else if (g.type === 'link') {
        clearOverlay();
        const end = screenPoint(e);
        if (Math.hypot(end.x - g.start.x, end.y - g.start.y) < 4) return;
        await placeLink(normalizeRect(pdfPoint(g.start), pdfPoint(end)), g.page);
      } else if (g.type === 'crop') {
        clearOverlay();
        const end = screenPoint(e);
        const screen = normalizeRect(g.start, end);
        if (screen.width < 4 || screen.height < 4) return;
        cropDraft = { page: g.page, screen, rect: normalizeRect(pdfPoint(g.start), pdfPoint(end)) };
        renderCropDraft();
      } else if (g.type === 'ink') {
        // A release may contain a newer sample than the last pointermove, or be
        // the only sample after a quick press. Keep it without turning taps into dots.
        const end = screenPoint(e),
          last = g.points.at(-1);
        if (end.x !== last.x || end.y !== last.y) g.points.push(end);
        if (g.points.length < 2) {
          clearOverlay();
          return;
        }
        const points = g.points.map(pdfPoint);
        await commitDrawing((doc) => drawMark(doc, g.page, { ...g, points }));
      } else {
        const end =
          g.type === 'shape'
            ? constrainShape(g.start, screenPoint(e), g.shape, e.shiftKey)
            : screenPoint(e);
        if (Math.hypot(end.x - g.start.x, end.y - g.start.y) < 4) {
          // A click drops a check mark or cross of a fixed size around the point.
          clearOverlay();
          if (g.type !== 'shape' || !['check', 'cross'].includes(g.shape)) return;
          const center = pdfPoint(g.start),
            half = MARK_SIZE / 2 / viewport.userUnit;
          const rect = {
            x: center.x - half,
            y: center.y - half,
            width: 2 * half,
            height: 2 * half,
          };
          await mutate((doc) => drawOrRedact(doc, g.page, { ...g, rect }));
          return;
        }
        const from = pdfPoint(g.start),
          to = pdfPoint(end);
        const rect = normalizeRect(from, to);
        await commitDrawing(
          (doc) => drawOrRedact(doc, g.page, { ...g, rect, from, to }),
          g.type === 'highlight' && g.kind !== 'redact' ? 'annotate' : 'edit',
        );
      }
    }),
  );
  for (const type of ['pointercancel', 'lostpointercapture'])
    overlay.addEventListener(type, (e) => {
      if (!gesture || e.pointerId !== gesture.pointerId) return;
      // An interrupted gesture must not survive into a later press or release.
      // Normal pointerup clears the gesture before implicit capture loss arrives.
      gesture = null;
      clearOverlay();
    });
  /* ---------- Links ---------- */
  const linkLabel = (url) => {
    try {
      const u = new URL(url);
      if (u.protocol === 'mailto:' || u.protocol === 'tel:') return u.pathname;
      return u.host + (u.pathname !== '/' ? u.pathname : '') + u.search;
    } catch {
      return url;
    }
  };
  /** The page a named navigation action ("NextPage" and the like) goes to from `from`. */
  function namedPage(action, from) {
    const last = pageCount - 1;
    return { FirstPage: 0, LastPage: last, NextPage: from + 1, PrevPage: from - 1 }[action] ?? null;
  }
  async function followLink(link) {
    if (link.readOnly) return;
    if (link.url) {
      window.open(link.url, '_blank', 'noopener');
      return;
    }
    if (link.blocked) {
      toast(
        link.address
          ? '此链接的地址无法在此打开。'
          : '此链接指向的内容无法在此打开。',
      );
      return;
    }
    if (link.action) {
      const to = namedPage(link.action, pageIndex);
      if (to >= 0 && to < pageCount && to !== pageIndex) await navigate(to);
      return;
    }
    // Resolving a named destination or page reference can wait on the PDF worker.
    // Claim the navigation now so a newer page or link choice can supersede it.
    const request = (pendingNavigation = { index: pageIndex });
    navigationGeneration++;
    const thisPdf = pdf;
    revealComment = null;
    updateStatus();
    try {
      const target = await destinationTarget(thisPdf, link.dest);
      if (destroyed || pdf !== thisPdf || pendingNavigation !== request) return;
      if (!target) toast('此链接在 PDF 中未指向任何位置。');
      // A link to a place on this page scrolls there; one to the page itself has arrived.
      else if (target.page !== pageIndex || target.left != null || target.top != null)
        await showDestination(target);
    } finally {
      if (pendingNavigation === request) {
        pendingNavigation = null;
        updateStatus();
      }
    }
  }
  const canEditLink = (link) => access().annotate && !link.readOnly && !link.locked;
  function linkMenuItems(link) {
    return [
      {
        permission: 'annotate',
        label: 'Edit link…',
        icon: 'Link',
        disabled: busy || !canEditLink(link),
        onSelect: safe(() => editLink(link)),
      },
      !link.blocked && {
        label: link.url ? '打开链接' : '转到链接页面',
        icon: link.url ? 'ExternalLink' : 'ArrowRight',
        disabled: link.readOnly,
        onSelect: safe(() => followLink(link)),
      },
      link.url && {
        label: '复制链接地址',
        icon: 'Copy',
        disabled: !access().copy,
        onSelect: safe(async () => {
          requireAccess('copy');
          await copyText(link.url);
          toast('已复制链接地址。');
        }),
      },
      !link.blocked && { separator: true },
      {
        permission: 'annotate',
        label: '删除链接',
        icon: 'Unlink',
        disabled: busy || !canEditLink(link),
        onSelect: pageAction(() =>
          mutate((doc) => removeLink(doc, pageIndex, link.id), '链接已删除。', 'annotate'),
        ),
      },
    ].filter(Boolean);
  }
  /** Link targets edit on activation; following a destination is always an explicit action. */
  function renderLinkTargets() {
    linkTargets.replaceChildren();
    linkTargets.hidden = tool !== 'select';
    if (!viewport) return;
    for (const link of links) {
      const [x0, y0, x1, y1] = link.rect;
      const a = viewport.convertToViewportPoint(x0, y0),
        b = viewport.convertToViewportPoint(x1, y1);
      const width = Math.abs(b[0] - a[0]),
        height = Math.abs(b[1] - a[1]);
      if (width < 1 || height < 1) continue;
      const target = el('button', {
        type: 'button',
        class: 'link-target',
        title: canEditLink(link) ? '编辑链接' : '链接选项',
        'aria-label': link.url
          ? `链接到 ${linkLabel(link.url)}`
          : link.blocked
            ? link.address
              ? '包含不受支持地址的链接'
              : '包含不受支持操作的链接'
            : '跳转到其他页面的链接',
        'aria-haspopup': canEditLink(link) ? 'dialog' : 'menu',
        onclick: safe(() => {
          if (busy) return;
          if (canEditLink(link)) return editLink(link);
          openMenu({ anchor: target, items: linkMenuItems(link), label: '链接' });
        }),
      });
      target.dataset.linkId = link.id;
      target.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openMenu({
          anchor: target,
          items: linkMenuItems(link),
          label: 'Link',
          x: e.clientX,
          y: e.clientY,
        });
      });
      Object.assign(target.style, {
        left: `${Math.min(a[0], b[0])}px`,
        top: `${Math.min(a[1], b[1])}px`,
        width: `${width}px`,
        height: `${height}px`,
      });
      linkTargets.append(target);
    }
  }
  /** Ask where a link should go, then add it over `rect` on page `page`. */
  async function placeLink(rect, page) {
    const choice = await linkDialog();
    if (!choice || destroyed) return;
    await mutate((doc) => addLink(doc, page, { rect, ...choice }), '链接已添加。', 'annotate');
    if (!destroyed && tool === 'link') await setTool('select');
  }
  let editingLink = null;
  async function editLink(link) {
    const sourcePage = pageIndex;
    if (editingLink) {
      // Native close() returns focus before its queued close event settles the dialog.
      // Preserve a rapid activation in that gap, after cleanup has restored focus.
      if (!editingLink.dialog || editingLink.dialog.open) return;
      await editingLink.closed;
    }
    if (
      editingLink ||
      busy ||
      destroyed ||
      sourcePage !== pageIndex ||
      link.readOnly ||
      link.locked
    )
      return;
    requireAccess('annotate');
    const version = beginDialogRequest();
    const operation = { dialog: null, closed: null };
    editingLink = operation;
    try {
      await deselectObjects();
      const destination = link.dest
        ? await destinationPage(pdf, link.dest)
        : link.action
          ? Math.min(pageCount - 1, Math.max(0, namedPage(link.action, sourcePage)))
          : null;
      if (!canOpenDialog(version) || sourcePage !== pageIndex) return;
      const initial = { url: link.url || link.address || '', page: destination };
      // Safari does not focus buttons on pointer activation. Give the dialog a
      // stable return target so Escape also allows immediate keyboard editing.
      linkTargets
        .querySelector(`[data-link-id="${CSS.escape(link.id)}"]`)
        ?.focus({ preventScroll: true });
      operation.closed = linkDialog(initial, link, (dialog) => (operation.dialog = dialog));
      const choice = await operation.closed;
      if (!choice || destroyed) return;
      // Opening, cancelling, or saving an unchanged link must not create history or
      // replace an existing page destination's precise position and zoom.
      if (choice.page != null ? choice.page === initial.page : choice.url === initial.url) return;
      const ordinal = links.findIndex((entry) => entry.id === link.id);
      await mutate(
        (doc) => updateLink(doc, sourcePage, link.id, choice),
        '链接已更新。',
        'annotate',
      );
      if (destroyed || sourcePage !== pageIndex) return;
      // Changing a destination preserves link order, but detaching a shared link changes its ID.
      const edited = links.find((entry) => entry.id === link.id) || links[ordinal];
      if (edited && document.activeElement === document.body)
        linkTargets
          .querySelector(`[data-link-id="${CSS.escape(edited.id)}"]`)
          ?.focus({ preventScroll: true });
    } finally {
      if (editingLink === operation) editingLink = null;
    }
  }
  function linkDialog(initial = null, link = null, onOpen) {
    return new Promise((resolve) => {
      let result = null;
      const url = el('input', {
        class: 'input',
        id: 'link-url',
        inputmode: 'url',
        placeholder: '例如：example.com/page',
        value: initial?.url || '',
        autocomplete: 'off',
        'aria-label': '链接的目标网址',
      });
      const pageNumber = el('input', {
        type: 'number',
        class: 'input',
        id: 'link-page',
        min: 1,
        max: pdf.numPages,
        step: 1,
        value: initial?.page != null ? initial.page + 1 : Math.min(pdf.numPages, pageIndex + 2),
        'aria-label': '链接的目标页码',
      });
      const kind = (value, label, checked) =>
        el(
          'label',
          { class: 'choice-row' },
          el('input', { type: 'radio', name: 'link-kind', value, checked }),
          el('span', {}, label),
        );
      const isPage = initial?.page != null;
      const webChoice = kind('url', '网页地址', !isPage),
        pageChoice = kind('page', '此 PDF 中的页面', isPage);
      url.addEventListener('input', () => {
        webChoice.querySelector('input').checked = true;
      });
      pageNumber.addEventListener('input', () => {
        pageChoice.querySelector('input').checked = true;
      });
      const list = el(
        'div',
        { class: 'choice-list', role: 'radiogroup', 'aria-label': '链接目标' },
        el('div', { class: 'choice-with-input' }, webChoice, url),
        el('div', { class: 'choice-with-input' }, pageChoice, pageNumber),
      );
      const form = el('form', { class: 'stack', novalidate: true }, list);
      const apply = () => {
        const web = list.querySelector('input:checked')?.value !== 'page';
        try {
          if (web) {
            if (initial && url.value === initial.url && initial.page == null) {
              dialog.close();
              return;
            }
            result = { url: normalizeUrl(url.value) };
          } else {
            const to = Number(pageNumber.value);
            if (!Number.isInteger(to) || to < 1 || to > pdf.numPages)
              throw new Error(`请选择 1 到 ${pdf.numPages} 之间的页码。`);
            result = { page: to - 1 };
          }
        } catch (error) {
          toast(error.message, { error: true });
          (web ? url : pageNumber).focus();
          return;
        }
        dialog.close();
      };
      form.onsubmit = (e) => {
        e.preventDefault();
        apply();
      };
      const actions = [
        button('取消', null, () => dialog.close()),
        button(initial ? '保存链接' : '添加链接', 'Link', apply, 'btn primary'),
      ];
      if (link && !link.blocked)
        actions.unshift(
          button(
            link.url ? 'Open link' : 'Go to linked page',
            link.url ? 'ExternalLink' : 'ArrowRight',
            safe(() => {
              dialog.close();
              return followLink(link);
            }),
          ),
        );
      const dialog = modal(initial ? '编辑链接' : '添加链接', form, actions);
      dialog.addEventListener('close', () => resolve(result), { once: true });
      onOpen?.(dialog);
      (isPage ? pageNumber : url).focus();
    });
  }
  /* ---------- Crop mode ---------- */
  /** Dim everything outside the kept area and outline it. */
  function drawCropPreview(ctx, r) {
    ctx.save();
    ctx.fillStyle = 'rgba(17, 17, 17, 0.45)';
    ctx.beginPath();
    ctx.rect(0, 0, viewport.width, viewport.height);
    ctx.rect(r.x, r.y, r.width, r.height);
    ctx.fill('evenodd');
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();
    ctx.strokeRect(r.x, r.y, r.width, r.height);
    ctx.restore();
  }
  function discardCropDraft() {
    cropDraft = null;
    properties.clear('crop');
  }
  /** Show the kept area with the choice of cropping this page or all of them. */
  function renderCropDraft() {
    if (!cropDraft || cropDraft.page !== pageIndex || !viewport) return;
    const ctx = clearOverlay();
    ctx.setTransform(overlay.width / viewport.width, 0, 0, overlay.height / viewport.height, 0, 0);
    drawCropPreview(ctx, cropDraft.screen);
    const panel = el(
      'div',
      { class: 'crop-panel', role: 'group', 'aria-label': '裁剪区域' },
      button(
        '裁剪当前页面',
        'Crop',
        safe(() => applyCrop([cropDraft.page])),
        'btn primary',
      ),
      button(
        '裁剪所有页面',
        'Files',
        safe(() => applyCrop(Array.from({ length: pdf.numPages }, (_, i) => i))),
        'btn',
      ),
      iconButton('放弃裁剪区域', 'X', () => {
        discardCropDraft();
        clearOverlay();
        overlay.focus({ preventScroll: true });
      }),
    );
    properties.show('crop', '裁剪', panel);
    panel.querySelector('button').focus({ preventScroll: true });
  }
  async function applyCrop(indices) {
    const draft = cropDraft;
    if (!draft || busy) return;
    // The reload after the change drops the draft; a refused crop keeps it for another try.
    await mutate(
      (doc) => cropPages(doc, indices, cropMargins(doc, draft.page, draft.rect)),
      indices.length > 1 ? `All ${indices.length} pages cropped.` : '页面已裁剪。',
    );
    if (!destroyed && tool === 'crop') await setTool('select');
  }
  /** Crop by typed margins: the keyboard's way into cropping, and exact when it matters. */
  function cropDialog() {
    if (!pdf) return;
    const fields = ['top', 'right', 'bottom', 'left'].map((key) => {
      const input = el('input', {
        type: 'number',
        class: 'input',
        min: 0,
        step: 'any',
        value: 0,
        required: true,
      });
      return {
        key,
        input,
        row: labeled(`crop-${key}`, `${key[0].toUpperCase()}${key.slice(1)} (pt)`, input),
      };
    });
    // Every page can be chosen at once, as the crop area offers; the current page stays first.
    const choices = pageChoices('crop-pages', pdf.numPages, { all: true, start: 'current' });
    const form = el(
      'form',
      { class: 'stack' },
      el(
        'p',
        { class: 'muted' },
        '按当前视图裁切这些页边距。原始内容仍保留在文件中；“清除裁剪”可再次显示完整页面。',
      ),
      el('div', { class: 'field-grid' }, ...fields.map((f) => f.row)),
      el('p', { class: 'muted' }, '页面范围'),
      choices.list,
    );
    const apply = safe(async () => {
      if (!form.reportValidity()) return;
      const margins = Object.fromEntries(fields.map((f) => [f.key, Number(f.input.value)]));
      const indices = choices.indices();
      // A range can name a page twice; "All" is said only when every page was chosen.
      const count = new Set(indices).size;
      const committed = await mutateDialog(
        d,
        (doc) => cropPages(doc, indices, margins),
        count === 1
          ? '页面已裁剪。'
          : count === pdf.numPages
            ? `全部 ${count} 页已裁剪。`
            : `${count} 页已裁剪。`,
      );
      if (committed && !destroyed && tool === 'crop') await setTool('select');
    });
    form.onsubmit = (e) => {
      e.preventDefault();
      apply();
    };
    const d = modal('裁剪页面', form, [
      button('取消', null, () => d.close()),
      button('裁剪', 'Crop', apply, 'btn primary'),
    ]);
    fields[0].input.focus();
  }
  function textBox(run) {
    const m = matrix(viewport.transform, run.transform);
    const size = Math.hypot(m[2], m[3]);
    return {
      x: m[4] + m[2] * run.ascent,
      y: m[5] + m[3] * run.ascent,
      size,
      width: Math.max(8, (run.advance / run.state.size) * size),
      height: Math.max(size, (run.ascent - run.descent) * size),
      transform: `matrix(${m[0] / size},${m[1] / size},${-m[2] / size},${-m[3] / size},0,0)`,
    };
  }
  const textViewportPoint = (e) => {
    const rect = paper.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) * viewport.width) / rect.width,
      ((e.clientY - rect.top) * viewport.height) / rect.height,
    ];
  };
  const textPointerPoint = (e) => viewport.convertToPdfPoint(...textViewportPoint(e));
  function textCaretAtPdfPoint(edit, point) {
    const position = viewport.convertToViewportPoint(...point);
    const rect = paper.getBoundingClientRect();
    placeTextCaret(edit.input, {
      clientX: rect.left + (position[0] * rect.width) / viewport.width,
      clientY: rect.top + (position[1] * rect.height) / viewport.height,
    });
  }
  // A dock opening on a small screen can occupy the first click's location.
  // Keep native multi-click ownership with the selected text instead of letting
  // the newly inserted properties intercept the second click (or activate Delete).
  let textClickOwner = null;
  const dockInterceptsTextClick = (e) =>
    e.detail === 2 &&
    textClickOwner?.edit === textEdit &&
    textEdit &&
    !textEdit.editing &&
    properties.root.contains(e.target);
  editorRoot.addEventListener(
    'mousedown',
    (e) => {
      if (dockInterceptsTextClick(e)) e.preventDefault();
    },
    true,
  );
  editorRoot.addEventListener(
    'click',
    (e) => {
      if (dockInterceptsTextClick(e)) {
        e.preventDefault();
        e.stopPropagation();
        const { edit, point } = textClickOwner;
        textClickOwner = null;
        setTextEditing(edit, true);
        revealEditor(edit.input);
        textCaretAtPdfPoint(edit, point);
      } else if (e.detail === 1) {
        textClickOwner =
          textEdit && e.target.closest('.text-targets, .text-edit-handles')
            ? { edit: textEdit, point: textPointerPoint(e) }
            : null;
      }
    },
    true,
  );
  function cancelTextSelection() {
    textSelectionVersion++;
    textClickOwner = null;
    textPointer?.edit?.positionControl.cancel();
    textPointer = null;
  }
  function beginTextSelection(e, run) {
    if (tool !== 'select' || busy || !pageReady || e.button !== 0 || !e.isPrimary) return;
    e.preventDefault();
    e.stopPropagation();
    cancelTextSelection();
    const request = (textPointer = {
      start: e,
      last: e,
      from: textPointerPoint(e),
      page: pageIndex,
      ended: false,
      editingPoint: null,
      edit: null,
      focusFrom: document.activeElement,
    });
    textTargets.setPointerCapture(e.pointerId);
    safe(async () => {
      let edit;
      try {
        edit = await textDialog(null, run, { editing: false, reveal: false });
      } finally {
        if (!edit && textPointer === request) textPointer = null;
      }
      if (textPointer !== request || !edit || request.page !== pageIndex || tool !== 'select')
        return;
      request.edit = edit;
      const focus =
        canFocusSelection(request.focusFrom) ||
        edit.handles.contains(document.activeElement) ||
        edit.input.contains(document.activeElement);
      edit.positionControl.begin(request.start, { capture: false, from: request.from, focus });
      edit.positionControl.drag(request.last);
      if (request.editingPoint) setTextEditing(edit, true, request.editingPoint, { focus });
      if (request.ended) {
        textPointer = null;
        edit.positionControl.end(request.last);
      }
    })();
  }
  workspace.addEventListener(
    'pointerdown',
    (e) => {
      const request = textPointer;
      if (
        !request?.ended ||
        e.button !== 0 ||
        !e.isPrimary ||
        e.timeStamp - request.start.timeStamp > 500 ||
        Math.hypot(e.clientX - request.start.clientX, e.clientY - request.start.clientY) > 4
      )
        return;
      // Own the second press at the workspace level: saving the preceding box
      // clears its text targets during rendering, so this press may hit the page
      // underneath. It must still edit the pending selection, not deselect it.
      e.preventDefault();
      e.stopPropagation();
      request.editingPoint = e;
    },
    true,
  );
  textTargets.addEventListener('pointermove', (e) => {
    if (textPointer?.start.pointerId !== e.pointerId || textPointer.ended) return;
    textPointer.last = e;
    textPointer.edit?.positionControl.drag(e);
  });
  textTargets.addEventListener('pointerup', (e) => {
    const request = textPointer;
    if (request?.start.pointerId !== e.pointerId || request.ended) return;
    request.last = e;
    request.ended = true;
    if (request.edit) {
      textPointer = null;
      request.edit.positionControl.end(e);
    }
  });
  textTargets.addEventListener('click', (e) => {
    if (tool !== 'select' || e.detail < 2) return;
    // The second click may arrive before the preceding text box finishes saving.
    if (textPointer) {
      textPointer.editingPoint = e;
      if (textPointer.edit) setTextEditing(textPointer.edit, true, e);
    } else if (textEdit && !textEdit.editing) setTextEditing(textEdit, true, e);
  });
  for (const type of ['pointercancel', 'lostpointercapture'])
    textTargets.addEventListener(type, (e) => {
      if (textPointer?.start.pointerId === e.pointerId && !textPointer.ended) cancelTextSelection();
    });
  function setTextEditing(edit, editing, point, { focus = true } = {}) {
    if (textEdit !== edit) return;
    edit.editing = editing;
    edit.handles.classList.toggle('is-typing', editing);
    edit.input.classList.toggle('text-object-selected', !editing);
    if (edit.input.tagName === 'TEXTAREA') edit.input.readOnly = !editing;
    else edit.input.contentEditable = String(editing);
    edit.input.setAttribute('aria-readonly', String(!editing));
    edit.input.tabIndex = editing ? 0 : -1;
    layoutTextEdit();
    if (focus && editing) {
      edit.input.focus({ preventScroll: true });
      if (point) placeTextCaret(edit.input, point);
      else edit.input.select();
    } else if (focus) edit.positionControl.handle.focus({ preventScroll: true });
    syncStyleButtons();
  }
  async function checkpointText(edit) {
    // Typing remains one native undo session. Object drags are individual document edits.
    if (textEdit !== edit || edit.editing || !pendingTextEdit()) return;
    const version = textSelectionVersion,
      page = pageIndex,
      selectedTool = tool;
    const focusedHandle = edit.handles.contains(document.activeElement)
      ? document.activeElement.getAttribute('aria-label')
      : null;
    const text = drawnText(edit, edit.input.value).replace(/\s/g, '');
    const anchor = edit.run
      ? [edit.run.transform[4] + edit.offset[0], edit.run.transform[5] + edit.offset[1]]
      : [edit.point.x, edit.point.y];
    textCheckpoint = edit;
    try {
      await finishTextEdit();
      if (
        destroyed ||
        textEdit ||
        textPointer ||
        version !== textSelectionVersion ||
        page !== pageIndex ||
        tool !== selectedTool
      )
        return;
      const candidates = textRuns.filter(
        (run) => run.editable && run.text.replace(/\s/g, '') === text,
      );
      candidates.sort(
        (a, b) =>
          Math.hypot(a.transform[4] - anchor[0], a.transform[5] - anchor[1]) -
          Math.hypot(b.transform[4] - anchor[0], b.transform[5] - anchor[1]),
      );
      if (candidates[0]) {
        const focus =
          document.activeElement === document.body || document.activeElement === overlay;
        const restored = await textDialog(null, candidates[0], {
          editing: false,
          reveal: false,
          focus,
        });
        if (focus && focusedHandle && restored)
          [...restored.handles.querySelectorAll('button')]
            .find((handle) => handle.getAttribute('aria-label') === focusedHandle)
            ?.focus({ preventScroll: true });
      }
    } finally {
      textCheckpoint = null;
      if (!textEdit) {
        properties.clear('text');
        syncStyleButtons();
        refitPage();
      }
    }
  }
  async function deselectObjects() {
    cancelTextSelection();
    await finishDrafts();
    pageImages.close();
    selectedHighlight = null;
    renderHighlightTargets();
    refitPage();
  }
  workspace.addEventListener('scroll', () => {
    // Scrolling moves the document under a stationary captured pointer. Refresh
    // from its last client position, using the page's current coordinate transform.
    textEdit?.positionControl.refresh();
    textEdit?.widthControl?.refresh();
    pageImages.refresh();
    if (gesture) updateDrawingGesture(gesture.event);
  });
  /** Whether a press lets go of the text, note, markup or object selected or edited beside it. */
  const pressesAway = (e) =>
    e.button === 0 &&
    e.isPrimary &&
    (!busy || finishingText || !!pageImages.selected) &&
    !e.target.closest(
      '.text-target, .text-edit-handles, .page-text-input, .image-target, .path-target, .image-controls button, .note-target, .highlight-target, .form-widget, .link-target, .drawing-overlay.active',
    ) &&
    !!(
      textEdit ||
      finishingText ||
      noteEdit ||
      pageImages.selected ||
      pageImages.active ||
      selectedHighlight ||
      textPointer
    );
  // A finger put down beside the selection may be starting to scroll or pinch the page rather
  // than tapping away from it: what is selected or being typed stays until the finger lifts from
  // a tap. Letting go at once closed a note or a text edit (and its keyboard) whenever the page
  // was scrolled, and a pinch then found the editor busy saving and did not zoom.
  let touchAway = null;
  workspace.addEventListener('pointerup', (e) => {
    const tap = touchAway;
    if (tap?.id !== e.pointerId) return;
    touchAway = null;
    if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 10) letGo(e);
  });
  workspace.addEventListener('pointercancel', (e) => {
    if (touchAway?.id === e.pointerId) touchAway = null;
  });
  workspace.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return letGo(e);
    // A second finger makes it a pinch.
    if (!e.isPrimary) return void (touchAway = null);
    touchAway = { id: e.pointerId, x: e.clientX, y: e.clientY };
    // The field being typed in keeps the focus, and the keyboard, meanwhile.
    if (pressesAway(e)) e.preventDefault();
  });
  function letGo(e) {
    // A press anywhere else lets go of a selected comment.
    if (annotationLayer.selected && !e.target.closest('.annotation-target'))
      annotationLayer.clear();
    if (!pressesAway(e)) return;
    e.preventDefault();
    safe(async () => {
      const priorFocus = document.activeElement;
      await deselectObjects();
      if (
        document.activeElement === document.body ||
        document.activeElement === overlay ||
        document.activeElement === priorFocus
      )
        workspace.focus({ preventScroll: true });
    })();
  }
  // Each run's target, so the keyboard can return to the text it was editing.
  let textTargetOf = new WeakMap();
  /**
   * Cancel the text draft from the keyboard. Like a picture or shape, the text hands the
   * keyboard back to its own target, so Tab and Enter carry on from there; new text, or text
   * whose target is gone, leaves it on the page (`fallback`).
   */
  function leaveTextEdit(fallback) {
    const run = textEdit?.run;
    const done = finishTextEdit(false);
    fallback.focus({ preventScroll: true });
    safe(async () => {
      await done;
      const target = run && textTargetOf.get(run);
      if (
        target?.isConnected &&
        [document.body, workspace, overlay].includes(document.activeElement)
      )
        target.focus({ preventScroll: true });
    })();
  }
  function renderTextTargets() {
    textTargets.replaceChildren();
    textTargetOf = new WeakMap();
    textTargets.hidden = !['text', 'select'].includes(tool) || !access().edit;
    textTargets.classList.toggle('select-text-objects', tool === 'select');
    if (!access().edit) return;
    for (const run of textRuns) {
      if (!run.text.trim() || !run.editable) continue;
      const box = textBox(run);
      if (!Number.isFinite(box.size) || box.size < 1) continue;
      const target = el('button', {
        class: 'text-target',
        type: 'button',
        'aria-label': `编辑文本: ${readingOrder(run.text)?.text ?? run.text}`,
        title: '编辑文本',
        onclick: safe(async (e) => {
          if (tool !== 'text' && e.detail) return;
          const point = e.detail ? textPointerPoint(e) : null;
          const edit = await textDialog(null, run, {
            editing: tool === 'text',
            reveal: !e.detail,
          });
          if (edit && point) {
            // A compact toolbar can lose a row when the placement button is hidden.
            // Keep the caret at the same PDF location even if the page shifts on screen.
            textCaretAtPdfPoint(edit, point);
          }
        }),
      });
      textTargetOf.set(run, target);
      target.addEventListener('pointerdown', (e) => beginTextSelection(e, run));
      Object.assign(target.style, {
        left: `${box.x}px`,
        top: `${box.y}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
        transform: box.transform,
      });
      textTargets.append(target);
    }
  }
  let finishingForms;
  /** Saves the words typed into the selected comment's Comment field, which saves on change. */
  let annotationTextDraft = null;
  async function finishDrafts(skipImages = false, { noteMoving = false } = {}) {
    await annotationLayer.finish();
    // A note's move is saved first (it saves the other drafts, without waiting for itself).
    if (!noteMoving && (noteNudge || noteMove)) await saveNoteNudge();
    // A save or download from the keyboard leaves the field focused, so its change is not yet
    // saved; the words typed go out with the PDF too.
    await annotationTextDraft?.();
    if (!skipImages) await pageImages.finish();
    await finishTextEdit();
    await finishNoteEdit();
    if (finishingForms) return finishingForms;
    if (!pageForms.draft.dirty) {
      pageForms.clearHistory();
      return;
    }
    if (busy || destroyed) throw new Error('请等待当前编辑完成。');
    const priorFocus = document.activeElement;
    const snapshot = pageForms.draft.snapshot();
    const values = pageForms.draft.values;
    pageForms.rememberFocus();
    pageForms.draft.reset();
    // Keep a baseline if the PDF operation is a no-op and does not trigger a reload.
    pageForms.draft.base = new Map([...snapshot.base, ...snapshot.changes]);
    finishingForms = (async () => {
      try {
        await mutate((doc) => fillFields(doc, values), null, 'fill');
        pageForms.clearError();
      } catch (error) {
        pageForms.restore(snapshot);
        pageForms.showError(error.message, {
          field: error.field,
          focus:
            document.activeElement === document.body ||
            document.activeElement === priorFocus ||
            pageForms.owns(document.activeElement),
        });
        updateStatus();
        throw error;
      } finally {
        finishingForms = null;
      }
    })();
    return finishingForms;
  }
  function finishTextEdit(apply = true) {
    if (finishingText) return finishingText;
    if (!textEdit) return Promise.resolve();
    finishingText = commitTextEdit(apply).finally(() => {
      finishingText = null;
    });
    return finishingText;
  }
  async function commitTextEdit(apply = true) {
    const edit = textEdit;
    if (!edit) return;
    if (busy) throw new Error('请等待当前编辑完成。');
    const priorFocus = document.activeElement;
    if (apply) {
      // Finishing from the keyboard can leave a numeric field focused. Blur it to
      // deliver its pending native change before reading the draft.
      const field = document.activeElement;
      if (edit.panel.contains(field) && field.matches('input')) field.blur();
      edit.positionControl.validate();
      edit.widthControl?.validate();
      if (hasCjkText(edit.input.value)) {
        await loadDraftCjkFaces(edit);
        if (textEdit !== edit) return;
        layoutTextEdit();
      }
    }
    let value = drawnText(edit, edit.input.value);
    let segments = drawnSegments(edit, edit.input.segments?.());
    const paragraphChanged =
      edit.run?.paragraph &&
      (value !== edit.run.text ||
        JSON.stringify(segments) !== JSON.stringify(edit.run.segments) ||
        Math.abs(edit.size - edit.run.state.size) > 1e-8 ||
        Math.abs(edit.width - edit.originalWidth) > 1e-8 ||
        edit.hex !== textColor(edit.run) ||
        styleChanged(edit));
    const fontStyle = styleChanged(edit)
      ? {
          ...(edit.bold !== edit.original.bold && { bold: edit.bold }),
          ...(edit.italic !== edit.original.italic && { italic: edit.italic }),
        }
      : undefined;
    const flow = apply && paragraphChanged ? edit.input.exportLayout() : null;
    if (flow) {
      value = drawnText(edit, flow.text);
      segments = drawnSegments(edit, flow.segments);
    }
    const lineOffsets =
      flow?.lineOffsets ??
      (apply && !edit.run?.paragraph && value.includes('\n')
        ? edit.input.measureLayout?.().lineOffsets
        : undefined);
    if (!apply || (!edit.run && !value.trim())) {
      clearTextPreview(edit);
      textEdit = null;
      edit.panel.remove();
      edit.input.remove();
      edit.handles.remove();
      properties.clear('text');
      syncStyleButtons();
      updateStatus();
      refitPage();
      return;
    }
    textEdit = null;
    // Keep the draft and its erased-source background over the old page until the
    // replacement is painted. Removing them first briefly resurrected the old words.
    // WebKit can keep editing a focused inert input. Release its native editing
    // focus before locking the draft, so keystrokes cannot change a value already saving.
    if (edit.input.contains(document.activeElement)) document.activeElement.blur();
    edit.input.inert = edit.panel.inert = edit.handles.inert = true;
    edit.previewController?.abort();
    edit.previewController = null;
    try {
      await mutate(
        (doc) =>
          edit.run
            ? replaceTextGroup(doc, edit.page, edit.run, value, {
                segments,
                lineOffsets,
                reflow: Boolean(flow),
                paragraph: flow
                  ? {
                      width: edit.width / edit.physicalScale / edit.widthScale,
                      leading: edit.run.paragraph.leading,
                      softBreaks: flow.softBreaks,
                    }
                  : undefined,
                size: edit.size,
                hex: edit.hex,
                offset: edit.offset,
                fontStyle,
                underline: edit.underline,
                strikethrough: edit.strikethrough,
              })
            : addText(doc, edit.page, {
                text: value,
                ...edit.point,
                size: edit.size,
                hex: edit.hex,
                rotation: edit.rotation,
                variant: textVariant(edit.bold, edit.italic),
                underline: edit.underline,
                strikethrough: edit.strikethrough,
              }),
        null,
        'edit',
        { retainScale: properties.switching },
      );
    } catch (error) {
      textEdit = edit;
      edit.input.inert = edit.panel.inert = edit.handles.inert = false;
      syncStyleButtons();
      if (!edit.background) startTextPreview(edit);
      edit.error.textContent = error.message;
      edit.error.hidden = false;
      layoutTextEdit();
      if (document.activeElement === document.body || document.activeElement === priorFocus)
        edit.input.focus();
      updateStatus();
      throw error;
    }
    clearTextPreview(edit);
    edit.panel.remove();
    edit.input.remove();
    edit.handles.remove();
    if (textCheckpoint !== edit) {
      properties.clear('text');
      syncStyleButtons();
      // A no-op commit does not reload, so apply any window resize that the draft deferred.
      refitPage();
    }
    // Return lost focus to the page. External output actions manage their own focus
    // recovery, and a control reached while saving must keep its focus.
    const inDraft = [edit.input, edit.panel, edit.handles].some((part) =>
      part.contains(priorFocus),
    );
    if (!destroyed && document.activeElement === document.body) {
      // A control pressed outside the draft (a tool, say) was turned off while the edit saved,
      // which dropped its focus; it takes the focus back, as it keeps it with no draft open.
      if (
        !inDraft &&
        !saving &&
        !downloading &&
        priorFocus instanceof HTMLButtonElement &&
        priorFocus.isConnected &&
        !priorFocus.disabled &&
        editorRoot.contains(priorFocus)
      )
        priorFocus.focus({ preventScroll: true });
      else if (inDraft || (!saving && !downloading)) overlay.focus({ preventScroll: true });
    }
  }
  function textDialog(...args) {
    return selectionProperties(() => openTextEditor(...args));
  }
  async function openTextEditor(
    p,
    run = null,
    { editing = true, reveal = true, focus = true } = {},
  ) {
    const focusFrom = document.activeElement;
    const version = ++textSelectionVersion;
    if (finishingText) await finishingText;
    if (busy || !pageReady || destroyed || version !== textSelectionVersion) return;
    await finishDrafts();
    if (destroyed || version !== textSelectionVersion || !['select', 'text'].includes(tool)) return;
    pageImages.close();
    annotationLayer.clear();
    selectedHighlight = null;
    renderHighlightTargets();
    // A preceding edit reloads the PDF, so use the freshly indexed target.
    if (run)
      run = textRuns.find(
        (candidate) =>
          candidate.text === run.text &&
          candidate.transform.every((n, i) => Math.abs(n - run.transform[i]) < 0.0001),
      );
    if (!run && !p) return;
    const pageRect = paper.getBoundingClientRect();
    const box = run
      ? textBox(run)
      : {
          x: p.x,
          y: p.y - textSize * zoom * 0.85,
          size: textSize * zoom,
          width: Math.min(240, viewport.width - p.x),
          height: textSize * zoom * 1.35,
          transform: 'none',
        };
    const reading = run && readingOrder(run.text, run.segments);
    const input = run?.parts
      ? textLineInput(reading ? { ...run, text: reading.text, segments: reading.segments } : run)
      : el('textarea', {
          class: 'page-text-input',
          rows: 1,
          // No maxlength: a browser cuts a long paste short without a word; saving says why
          // text is too long and keeps the whole draft for shortening.
          'aria-label': run ? '编辑文本' : '添加文本',
          placeholder: run ? '' : '输入文本',
          spellcheck: true,
          wrap: 'off',
        });
    if (reading) {
      // Lay the line out in its own direction, still starting where the PDF's glyphs start.
      input.dir = reading.direction;
      input.style.textAlign = 'left';
    }
    if (!run?.parts) {
      input.value = reading?.text ?? (run?.text || '');
      // Tabs from a copied table have no glyph in the text fonts; they paste as spaces, and
      // the other line breaks apps copy paste as line breaks.
      input.addEventListener('paste', (e) => {
        const text = e.clipboardData?.getData('text/plain') ?? '';
        if (!needsDraftText(text)) return;
        e.preventDefault();
        document.execCommand('insertText', false, draftText(text));
      });
    }
    Object.assign(input.style, {
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${Math.max(80, box.width + 12)}px`,
      height: `${Math.max(28, box.height + 4)}px`,
      fontSize: `${box.size}px`,
      fontFamily: run?.fontFamily || 'Noto Sans, sans-serif',
      transform: box.transform,
    });
    input.addEventListener('input', () => {
      if (textEdit?.input === input) applyDraftStyle(textEdit);
      layoutTextEdit();
      updateStatus();
    });
    input.addEventListener('keydown', (e) => {
      // Escape and Enter belong to the input method while it is composing a character.
      if (e.isComposing) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        leaveTextEdit(overlay);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        safe(() => finishTextEdit())();
      }
    });
    const error = el('p', { class: 'text-edit-error', role: 'alert', hidden: true });
    const panel = el(
      'div',
      { class: 'text-edit-actions', role: 'group', 'aria-label': '文本属性' },
      el(
        'div',
        { class: 'text-edit-buttons' },
        button(
          '删除',
          'Trash2',
          safe(async () => {
            input.value = '';
            await finishDrafts();
          }),
          'btn danger',
          { 'aria-label': '删除文本' },
        ),
      ),
      error,
    );
    textEdit = {
      input,
      panel,
      error,
      run,
      direction: reading?.direction,
      editing,
      offset: [0, 0],
      page: pageIndex,
      point: p && pdfPoint(p),
      anchor: p,
      physicalScale: run
        ? (Math.hypot(run.transform[2], run.transform[3]) / run.state.size) * viewport.userUnit
        : viewport.userUnit,
      size: run?.state.size || textSize / viewport.userUnit,
      hex: run ? textColor(run) : color,
      rotation: viewport.rotation,
      bold: run ? runStyle(run, isBoldRun) : textBold,
      italic: run ? runStyle(run, isItalicRun) : textItalic,
      underline: run ? Boolean(run.underline) : textUnderline,
      strikethrough: run ? Boolean(run.strikethrough) : textStrikethrough,
    };
    textEdit.original = {
      bold: run ? textEdit.bold : false,
      italic: run ? textEdit.italic : false,
    };
    const edit = textEdit;
    applyDraftStyle(edit);
    syncStyleButtons();
    if (run?.paragraph) {
      edit.widthScale =
        Math.hypot(run.transform[0], run.transform[1]) /
        Math.hypot(run.transform[2], run.transform[3]);
      edit.width = edit.originalWidth = run.paragraph.width * edit.physicalScale * edit.widthScale;
      edit.widthControl = textWidthControls({
        input,
        getWidth: () => edit.width,
        setWidth: (width) => {
          edit.width = Math.abs(width - edit.originalWidth) < 0.0005 ? edit.originalWidth : width;
        },
        zoom,
        pointAt: textViewportPoint,
        edited: updateStatus,
        completed: safe(() => checkpointText(edit)),
        changed: () => {
          layoutTextEdit();
          updateStatus();
        },
      });
      panel.prepend(edit.widthControl.root);
    }
    edit.positionControl = textPositionControls({
      getPosition: () =>
        edit.run
          ? [edit.run.transform[4] + edit.offset[0], edit.run.transform[5] + edit.offset[1]]
          : [edit.point.x, edit.point.y],
      setPosition: ([x, y]) => {
        if (edit.run) edit.offset = [x - edit.run.transform[4], y - edit.run.transform[5]];
        else {
          edit.point = { x, y };
          const p = viewport.convertToViewportPoint(x, y);
          edit.anchor = { x: p[0], y: p[1] };
        }
      },
      viewport,
      edited: updateStatus,
      completed: safe(() => checkpointText(edit)),
      dragThreshold: 3,
      pointAt: textPointerPoint,
      changed: () => {
        layoutTextEdit();
        updateStatus();
      },
    });
    panel.prepend(edit.positionControl.root);
    const onTextKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        leaveTextEdit(overlay);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        safe(() => finishTextEdit())();
      } else if (
        e.target === edit.positionControl.handle &&
        (e.key === 'Enter' || e.key === 'F2')
      ) {
        e.preventDefault();
        setTextEditing(edit, true);
      } else if (
        e.target === edit.positionControl.handle &&
        ['Delete', 'Backspace'].includes(e.key)
      ) {
        e.preventDefault();
        input.value = '';
        safe(() => finishTextEdit())();
      }
    };
    edit.handles = el(
      'div',
      { class: 'text-edit-handles' },
      edit.positionControl.handle,
      edit.widthControl?.handle,
    );
    panel.addEventListener('keydown', onTextKey);
    edit.handles.addEventListener('keydown', onTextKey);
    const editOnDoubleClick = (e) => {
      if (!edit.editing) setTextEditing(edit, true, e);
    };
    edit.positionControl.handle.addEventListener('dblclick', editOnDoubleClick);
    edit.positionControl.handle.addEventListener('click', (e) => {
      if (e.detail > 1) editOnDoubleClick(e);
    });
    paper.append(input, edit.handles);
    properties.show('text', 'Text', panel);
    startTextPreview(edit);
    if (run) {
      const physicalSize = Number((textEdit.size * textEdit.physicalScale).toFixed(2));
      if (![...sizeInput.options].some((option) => Number(option.value) === physicalSize)) {
        const larger = [...sizeInput.options].find((option) => Number(option.value) > physicalSize);
        sizeInput.insertBefore(
          el('option', { value: physicalSize }, `${physicalSize} pt`),
          larger || null,
        );
      }
      sizeInput.value = String(physicalSize);
      textSize = physicalSize;
      colorInput.value = /^#[0-9a-f]{6}$/i.test(textEdit.hex) ? textEdit.hex : '#111111';
      color = colorInput.value;
    }
    setTextEditing(edit, editing, undefined, { focus: focus && canFocusSelection(focusFrom) });
    if (reveal) revealEditor(input);
    else {
      // Contextual controls can add a toolbar row on small screens. Keep the object
      // under the pointer so a drag or the second click of a double-click stays on it.
      const current = paper.getBoundingClientRect();
      workspace.scrollTop += current.top - pageRect.top;
      workspace.scrollLeft += current.left - pageRect.left;
    }
    updateStatus();
    return edit;
  }
  function layoutTextEdit() {
    if (!textEdit) return;
    const edit = textEdit;
    const box = edit.run
      ? textBox({
          ...edit.run,
          transform: edit.run.transform.map((n, i) =>
            i < 4 ? (n * edit.size) / edit.run.state.size : n + edit.offset[i - 4],
          ),
        })
      : {
          x: edit.anchor.x,
          y: edit.anchor.y - edit.size * viewport.userUnit * zoom * 0.85,
          size: edit.size * viewport.userUnit * zoom,
          width: 120,
          height: edit.size * viewport.userUnit * zoom * 1.35,
          transform: 'none',
        };
    const lines = edit.input.value.split('\n');
    // An empty draft shows its placeholder, which must fit too: a textarea that cannot wrap
    // would otherwise clip the hint and grow a scrollbar before anything is typed.
    const shown = edit.input.value ? lines : [edit.input.placeholder || ''];
    const measure = document.createElement('canvas').getContext('2d');
    const face = draftFace(edit);
    measure.fontKerning = 'none';
    measure.font = `${face.style} ${face.weight} ${box.size}px ${face.family || 'sans-serif'}`;
    // A single run keeps Tc/Tw in text-space units when its font size changes. Match
    // those distances in the draft and its width measurement, including page transforms.
    if (edit.run && !edit.run.parts) {
      const scale = box.size / edit.size;
      const letterSpacing = `${edit.run.state.charSpacing * scale}px`;
      const wordSpacing = `${
        !styleChanged(edit) && edit.run.widths.get(' ')?.space
          ? edit.run.state.wordSpacing * scale
          : 0
      }px`;
      Object.assign(edit.input.style, { letterSpacing, wordSpacing });
      Object.assign(measure, { letterSpacing, wordSpacing });
    }
    const metrics = measure.measureText('Mg');
    const lineHeight = box.size * 1.35;
    const ascent = metrics.fontBoundingBoxAscent ?? box.size * 0.9;
    const descent = metrics.fontBoundingBoxDescent ?? box.size * 0.2;
    const baselineOffset = ascent + (lineHeight - ascent - descent) / 2;
    const adjustment = box.size * (edit.run?.ascent || 0.85) - baselineOffset;
    const transform = new DOMMatrix(box.transform === 'none' ? undefined : box.transform);
    // Limit along the text's advance direction, including leftward and vertical writing on rotated pages.
    const availableWidth = Math.max(
      80,
      Math.min(
        ...[
          [transform.a, box.x, viewport.width],
          [transform.b, box.y, viewport.height],
        ]
          .filter(([direction]) => Math.abs(direction) > 1e-8)
          .map(([direction, start, limit]) =>
            direction > 0 ? (limit - start - 4) / direction : (start - 4) / -direction,
          ),
      ),
    );
    const paragraphWidth = edit.run?.paragraph && (edit.width / edit.widthScale) * zoom;
    edit.widthControl?.sync(Math.max(24, (availableWidth / zoom) * edit.widthScale));
    const characterWidths = new Map();
    const characterWidth = (char) => {
      if (!characterWidths.has(char)) characterWidths.set(char, measure.measureText(char).width);
      return characterWidths.get(char);
    };
    const width =
      paragraphWidth ||
      Math.max(
        80,
        box.width + 8,
        ...shown.map((line) => {
          // Canvas has no ligature switch. Summing individual standard-font letters
          // matches the draft's separate glyphs, including its character spacing.
          const width =
            face.ligatures === 'none'
              ? [...line].reduce((sum, char) => sum + characterWidth(char), 0)
              : measure.measureText(line).width;
          return width + 12;
        }),
      );
    Object.assign(edit.input.style, {
      left: `${box.x + transform.c * adjustment}px`,
      top: `${box.y + transform.d * adjustment}px`,
      width: `${Math.min(width, availableWidth)}px`,
      height: `${Math.max(28, box.height + 6, lines.length * box.size * 1.35 + 6)}px`,
      fontSize: `${box.size}px`,
      fontWeight: draftFace(edit).weight,
      fontStyle: draftFace(edit).style,
      color: edit.hex,
      textDecorationLine:
        [edit.underline && 'underline', edit.strikethrough && 'line-through']
          .filter(Boolean)
          .join(' ') || 'none',
      transform: box.transform,
    });
    edit.input.updateStyle?.(
      edit.hex,
      box.size,
      styleChanged(edit) ? (run) => draftFace(edit, run) : undefined,
    );
    const richLayout = edit.input.measureLayout?.();
    if (richLayout) {
      const shift = box.size * edit.run.ascent - richLayout.baseline;
      Object.assign(edit.input.style, {
        left: `${box.x + transform.c * shift}px`,
        top: `${box.y + transform.d * shift}px`,
        width: `${Math.min(paragraphWidth || Math.max(80, box.width + 8, richLayout.width + 12), availableWidth)}px`,
        height: `${Math.max(28, box.height + 6, richLayout.height + 6)}px`,
      });
    }
    if (edit.run?.state.mode === 1 || edit.run?.state.mode === 2) {
      const run = edit.run;
      // PDF.js strokes in text-matrix space, independently of the selected font size.
      const matrixScale = Math.hypot(run.state.tm[0], run.state.tm[1]);
      const strokeWidth =
        run.strokeWidth && matrixScale
          ? (run.strokeWidth / matrixScale) * edit.physicalScale * zoom
          : Math.max(Math.hypot(transform.a, transform.c), Math.hypot(transform.b, transform.d)) /
            Math.abs(transform.a * transform.d - transform.b * transform.c) /
            pagePixelRatio;
      // Leave room for the outline and antialiasing without shifting the glyph baseline.
      const padding = strokeWidth / 2 + 1;
      Object.assign(edit.input.style, {
        webkitTextFillColor: run.state.mode === 1 ? 'transparent' : edit.hex,
        webkitTextStrokeColor: edit.hex === textColor(run) ? run.strokeColor : edit.hex,
        webkitTextStrokeWidth: `${strokeWidth}px`,
        caretColor: edit.hex,
        padding: `${padding}px`,
        left: `${parseFloat(edit.input.style.left) - padding * (transform.a + transform.c)}px`,
        top: `${parseFloat(edit.input.style.top) - padding * (transform.b + transform.d)}px`,
        width: `${parseFloat(edit.input.style.width) + padding * 2}px`,
        height: `${parseFloat(edit.input.style.height) + padding * 2}px`,
      });
    }
    // The selection frame shares the text's own transform, including rotation and skew.
    for (const key of ['left', 'top', 'width', 'height', 'transform'])
      edit.handles.style[key] = edit.input.style[key];
  }
  async function placeCentered() {
    // A box of this size in the middle of the page as it is shown, turned or not.
    const centered = (width, height) => {
      const unit = screenUnit();
      return readerRect(
        {
          x: viewport.width / 2 - (width / 2) * unit,
          y: viewport.height / 2 - (height / 2) * unit,
        },
        width,
        height,
      );
    };
    if (tool === 'field') {
      if (busy || !pageReady) return;
      const size = ['checkbox', 'radio'].includes(fieldType) ? [14, 14] : [160, 22];
      await createField(centered(...size), pageIndex);
      return;
    }
    if (tool === 'certsign') {
      if (busy || !pageReady) return;
      // The page's empty signature field is the place to sign, when the form has one.
      const page = pageIndex;
      const empty = await emptySignatureField(page);
      if (empty) await signWithCertificate({ fieldName: empty.name, page });
      else await signWithCertificate({ rect: centered(200, 60), page });
      return;
    }
    if (tool === 'link') {
      if (busy || !pageReady) return;
      await placeLink(centered(160, 28), pageIndex);
      return;
    }
    if (!pageReady || busy) return;
    if (tool === 'text') return textDialog({ x: viewport.width * 0.25, y: viewport.height / 2 });
    if (tool === 'note')
      return openNoteEditor({ point: { x: viewport.width * 0.45, y: viewport.height * 0.45 } });
    if (['textbox', 'callout', 'cshape'].includes(tool)) {
      // As if clicked (a text box or callout) or dragged (a shape) about the page's middle.
      const unit = screenUnit() / viewport.userUnit;
      const start =
        tool === 'textbox'
          ? { x: viewport.width / 2 - 90 * unit, y: viewport.height / 2 - 25 * unit }
          : { x: viewport.width * (tool === 'callout' ? 0.3 : 0.35), y: viewport.height * 0.5 };
      const end =
        tool === 'cshape' ? { x: viewport.width * 0.65, y: viewport.height * 0.6 } : start;
      return placeComment(
        {
          type: tool,
          start,
          page: pageIndex,
          hex: color,
          width: stroke / viewport.userUnit,
          commentKind: commentShape.value,
        },
        end,
      );
    }
    if (['highlight', 'shape'].includes(tool)) {
      const a = pdfPoint({ x: viewport.width * 0.25, y: viewport.height * 0.48 });
      const b = pdfPoint({
        x: viewport.width * 0.75,
        y: viewport.height * (tool === 'highlight' ? 0.51 : 0.65),
      });
      await mutate(
        (doc) =>
          drawOrRedact(doc, pageIndex, {
            type: tool,
            kind: markupKind.value,
            shape: shapeSelect.value,
            hex: color,
            width: stroke / viewport.userUnit,
            rect: normalizeRect(a, b),
            from: a,
            to: b,
          }),
        null,
        tool === 'highlight' && markupKind.value !== 'redact' ? 'annotate' : 'edit',
      );
    }
  }
  /** Draw a mark, or, for the Redact tool's area marks, add a redaction mark over it. */
  async function drawOrRedact(doc, page, mark) {
    if (mark.type !== 'highlight' || mark.kind !== 'redact')
      return drawMark(doc, page, { ...mark, author: getUser()?.username || '' });
    const { x, y, width, height } = mark.rect;
    const { addRedactionMarks } = await loadRedaction();
    return addRedactionMarks(doc, page, [[x, y, x + width, y + height]], redactionStyle);
  }
  async function renderObjectPreview(
    bytes,
    pageIndex,
    background,
    signal,
    { view, width, height, ratio },
  ) {
    signal.throwIfAborted();
    const task = loadPdf(bytes);
    let rendering;
    const abort = () => {
      rendering?.cancel();
      task.destroy().catch(() => {});
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      const page = await (await task.promise).getPage(pageIndex + 1);
      signal.throwIfAborted();
      const vp = background ? view : page.getViewport({ scale: 1 });
      const out = el('canvas', {
        width: background ? width : Math.ceil(vp.width),
        height: background ? height : Math.ceil(vp.height),
      });
      rendering = page.render({
        canvasContext: out.getContext('2d'),
        viewport: vp,
        ...(background
          ? { transform: [ratio, 0, 0, ratio, 0, 0] }
          : { background: 'rgba(0,0,0,0)' }),
      });
      await rendering.promise;
      return out;
    } finally {
      signal.removeEventListener('abort', abort);
      await task.destroy();
    }
  }
  function clearTextPreview(edit) {
    edit?.previewController?.abort();
    edit?.background?.remove();
    if (edit) {
      edit.previewController = null;
      edit.background = null;
      edit.input.classList.remove('has-text-preview');
    }
  }
  function startTextPreview(edit) {
    if (!edit.run) return;
    clearTextPreview(edit);
    const controller = (edit.previewController = new AbortController()),
      signal = controller.signal;
    const bytes = session.bytes.slice(),
      geometry = {
        view: viewport,
        width: canvas.width,
        height: canvas.height,
        ratio: pagePixelRatio,
      };
    (async () => {
      const doc = await PDFDocument.load(bytes);
      signal.throwIfAborted();
      await replaceTextGroup(doc, edit.page, edit.run, '');
      const background = await renderObjectPreview(
        await savePdf(doc),
        edit.page,
        true,
        signal,
        geometry,
      );
      if (signal.aborted || textEdit !== edit) return;
      background.className = 'text-draft-background';
      background.style.width = `${geometry.view.width}px`;
      background.style.height = `${geometry.view.height}px`;
      edit.background = background;
      paper.append(background);
      edit.input.classList.add('has-text-preview');
    })().catch(() => {});
  }
  async function prepareImagePreview(entry, signal) {
    const source = editDocument,
      bytes = session.bytes.slice(),
      index = pageIndex;
    const view = viewport,
      width = canvas.width,
      height = canvas.height,
      ratio = pagePixelRatio;
    const imageBytes = await (entry.kind && entry.kind !== 'image' ? pathPreview : imagePreview)(
      source,
      entry,
    );
    const copy = await PDFDocument.load(bytes);
    signal.throwIfAborted();
    (entry.kind && entry.kind !== 'image' ? editPath : editImage)(copy, index, entry, {
      remove: true,
    });
    const without = await savePdf(copy);
    signal.throwIfAborted();
    const [background, image] = await Promise.all([
      renderObjectPreview(without, index, true, signal, { view, width, height, ratio }),
      renderObjectPreview(imageBytes, 0, false, signal, { view, width, height, ratio }),
    ]);
    return { background, image };
  }
  async function insertImage() {
    requireAccess('edit');
    try {
      await finishDrafts();
    } catch {
      return;
    }
    const input = el('input', { type: 'file', accept: 'image/png,image/jpeg' });
    input.onchange = safe(async () => {
      const file = input.files[0];
      if (!file || busy) return;
      if (file.size > MAX_IMAGE_SIZE) throw new Error('请选择小于 20 MB 的图片。');
      await setTool('select');
      const index = pageIndex,
        priorFocus = document.activeElement;
      await mutate(async (doc) => {
        // Reading belongs to the edit: output and navigation must wait for the chosen
        // image just as they wait for embedding and rendering it.
        const bytes = new Uint8Array(await file.arrayBuffer());
        await addImage(doc, index, bytes);
      }, '已添加图片。拖动可移动或调整大小。');
      const entry = imageRunCache
        .get(pageIndex)
        ?.filter((entry) => entry.kind === 'image')
        .at(-1);
      if (entry)
        pageImages.selectOrdinal(
          entry.ordinal,
          document.activeElement === document.body || document.activeElement === priorFocus,
        );
    });
    input.click();
  }
  /* ---------- Sticky notes ---------- */
  const pendingNoteEdit = () =>
    !!noteEdit &&
    !noteEdit.entry?.readOnly &&
    (noteEdit.textarea.value.trim() !== (noteEdit.entry?.text || '') ||
      (!!noteEdit.entry && noteEdit.color.value !== noteEdit.entry.hex));
  // A note dragged or nudged with the arrow keys, as a PDF offset not yet saved, and the move
  // being saved. Nudges are shown at once and saved as one move once the keys rest.
  let noteNudge = null,
    noteNudgeTimer = 0,
    noteMove = null,
    noteDrag = null,
    noteDragged = false;
  /** A screen offset on the page as a PDF offset, and back, for any page rotation. */
  function pageOffset(dx, dy, toScreen = false) {
    const convert = (x, y) =>
      toScreen ? viewport.convertToViewportPoint(x, y) : viewport.convertToPdfPoint(x, y);
    const [ax, ay] = convert(0, 0),
      [bx, by] = convert(dx, dy);
    return [bx - ax, by - ay];
  }
  function showNoteNudge(target, [dx, dy]) {
    target.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : '';
  }
  /** Save the note's pending move, after any move still being saved. */
  function saveNoteNudge() {
    clearTimeout(noteNudgeTimer);
    if (!noteNudge) return noteMove;
    const { id, ox, oy } = noteNudge;
    noteNudge = null;
    const run = (noteMove ?? Promise.resolve())
      .then(safe(() => moveNote(id, ox, oy)))
      .finally(() => {
        if (noteMove === run) noteMove = null;
      });
    noteMove = run;
    return run;
  }
  async function moveNote(id, ox, oy) {
    const reopen = noteEdit?.entry?.id === id;
    const focused = document.activeElement?.dataset?.noteId === id;
    await finishDrafts(false, { noteMoving: true });
    const entry = notes.find((note) => note.id === id);
    if (destroyed || !entry || !access().annotate) return renderNoteTargets();
    try {
      await mutate(
        (doc) => editNote(doc, pageIndex, id, { x: entry.x + ox, y: entry.y + oy }),
        null,
        'annotate',
        { retainScale: true },
      );
    } finally {
      // A move that was not made shows the note back where it is.
      if (!destroyed) renderNoteTargets();
    }
    if (destroyed || tool === 'hand') return;
    const moved = notes.find((note) => note.id === id);
    // Not waited for: the editor waits for the drafts, this move among them.
    if (reopen && moved) safe(() => openNoteEditor({ entry: moved, canFocus: () => false }))();
    if (focused && document.activeElement === document.body)
      [...noteTargets.children]
        .find((node) => node.dataset.noteId === id)
        ?.focus({
          preventScroll: true,
        });
  }
  /** Drag a note, or nudge it with the arrow keys (Shift for ten points), as shapes move. */
  function makeNoteMovable(target, entry, box) {
    target.classList.add('is-movable');
    const id = entry.id;
    // Kept on the page: a note dragged off it could not be reached again.
    const clamp = (dx, dy) => [
      Math.min(Math.max(dx, -box.left), viewport.width - box.left - box.width),
      Math.min(Math.max(dy, -box.top), viewport.height - box.top - box.height),
    ];
    // Escape during a drag puts the note back; releasing the pointer then neither moves nor
    // opens it.
    const escapeDrag = (e) => {
      if (e.key !== 'Escape' || e.isComposing || noteDrag?.id !== id) return;
      e.preventDefault();
      e.stopPropagation();
      if (target.hasPointerCapture(noteDrag.pointer))
        target.releasePointerCapture(noteDrag.pointer);
      noteDrag = null;
      window.removeEventListener('keydown', escapeDrag, true);
      showNoteNudge(target, [0, 0]);
      noteDragged = true;
      window.addEventListener('pointerup', () => setTimeout(() => (noteDragged = false), 0), {
        capture: true,
        once: true,
      });
    };
    target.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || busy || !pageReady) return;
      saveNoteNudge();
      noteDrag = {
        id,
        pointer: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        moved: false,
        stop: () => window.removeEventListener('keydown', escapeDrag, true),
      };
      target.setPointerCapture(e.pointerId);
      window.addEventListener('keydown', escapeDrag, true);
    });
    target.addEventListener('pointermove', (e) => {
      if (noteDrag?.id !== id || noteDrag.pointer !== e.pointerId) return;
      const [dx, dy] = clamp(e.clientX - noteDrag.x, e.clientY - noteDrag.y);
      if (!noteDrag.moved && Math.hypot(dx, dy) < 3) return;
      noteDrag.moved = true;
      noteDrag.offset = [dx, dy];
      showNoteNudge(target, [dx, dy]);
    });
    target.addEventListener('pointerup', (e) => {
      if (noteDrag?.id !== id || noteDrag.pointer !== e.pointerId) return;
      const done = noteDrag;
      noteDrag = null;
      window.removeEventListener('keydown', escapeDrag, true);
      if (!done.moved) return;
      // The click that ends a drag does not open the note.
      noteDragged = true;
      setTimeout(() => (noteDragged = false), 0);
      const [ox, oy] = pageOffset(...done.offset);
      noteNudge = { id, ox, oy };
      saveNoteNudge();
    });
    target.addEventListener('pointercancel', () => {
      if (noteDrag?.id !== id) return;
      noteDrag = null;
      window.removeEventListener('keydown', escapeDrag, true);
      showNoteNudge(target, [0, 0]);
    });
    target.addEventListener('keydown', (e) => {
      // Delete and Backspace delete the note, as they delete other comments.
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.repeat) {
        e.preventDefault();
        if (noteNudge?.id === id) {
          noteNudge = null;
          clearTimeout(noteNudgeTimer);
        }
        safe(async () => {
          if (busy || !pageReady) return;
          if (noteEdit?.entry?.id === id) return finishNoteEdit(true);
          const ordinal = notes.findIndex((note) => note.id === id);
          await finishDrafts();
          const current = notes.find((note) => note.id === id) || notes[ordinal];
          if (!current || destroyed) return;
          await mutate(
            (doc) => editNote(doc, pageIndex, current.id, { remove: true }),
            null,
            'annotate',
          );
          if (!destroyed && document.activeElement === document.body)
            overlay.focus({ preventScroll: true });
        })();
        return;
      }
      if (!e.key.startsWith('Arrow') || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      if (noteNudge && noteNudge.id !== id) saveNoteNudge();
      noteNudge ??= { id, ox: 0, oy: 0 };
      // The way the key points on screen, a point (ten with Shift) on the page at any zoom.
      const [ux, uy] = pageOffset(
        { ArrowLeft: -1, ArrowRight: 1 }[e.key] || 0,
        { ArrowUp: -1, ArrowDown: 1 }[e.key] || 0,
      );
      const step = (e.shiftKey ? 10 : 1) / (Math.hypot(ux, uy) || 1);
      const [ox, oy] = [ux * step, uy * step];
      const [sx, sy] = pageOffset(noteNudge.ox + ox, noteNudge.oy + oy, true);
      const [cx, cy] = clamp(sx, sy);
      [noteNudge.ox, noteNudge.oy] = pageOffset(cx, cy);
      showNoteNudge(target, [cx, cy]);
      clearTimeout(noteNudgeTimer);
    });
    target.addEventListener('keyup', (e) => {
      if (!e.key.startsWith('Arrow') || noteNudge?.id !== id) return;
      clearTimeout(noteNudgeTimer);
      noteNudgeTimer = setTimeout(saveNoteNudge, 180);
    });
    // Leaving the note saves its nudges after the same rest; a save or another edit (which
    // finishes the drafts) saves them at once. Saving on the spot would disable a button
    // pressed meanwhile before its click.
    target.addEventListener('blur', () => {
      if (noteNudge?.id !== id) return;
      clearTimeout(noteNudgeTimer);
      noteNudgeTimer = setTimeout(saveNoteNudge, 180);
    });
    // Nudges not yet saved stay in view when the page is drawn again.
    if (noteNudge?.id === id)
      showNoteNudge(target, clamp(...pageOffset(noteNudge.ox, noteNudge.oy, true)));
  }
  /** Clickable icons for the page's notes, shown in Select and with the Note tool. */
  function renderNoteTargets() {
    // A drag cannot go on across a redraw (a zoom, say): its target and pointer capture are
    // gone. Left behind, it took the next Escape and the next click on the note.
    noteDrag?.stop();
    noteDrag = null;
    noteTargets.replaceChildren();
    noteTargets.hidden = !['select', 'note'].includes(tool);
    if (!viewport) return;
    for (const entry of notes) {
      const corners = [
        viewport.convertToViewportPoint(entry.x, entry.y),
        viewport.convertToViewportPoint(entry.x + entry.width, entry.y - entry.height),
      ];
      const left = Math.min(corners[0][0], corners[1][0]),
        top = Math.min(corners[0][1], corners[1][1]);
      const target = el('button', {
        class: 'note-target',
        type: 'button',
        'aria-label': `${entry.readOnly || !access().annotate ? 'Read' : 'Edit'} note: ${entry.text.slice(0, 80)}`,
        title: entry.text.slice(0, 200),
        'aria-pressed': noteEdit?.entry?.id === entry.id,
        'data-note-id': entry.id,
        onclick: safe(() =>
          selectionProperties(async () => {
            if (busy || !pageReady || noteDragged) return;
            if (noteEdit?.entry?.id === entry.id) return;
            const focusFrom = document.activeElement;
            cancelTextSelection();
            const ordinal = notes.indexOf(entry);
            await finishDrafts();
            pageImages.close();
            selectedHighlight = null;
            renderHighlightTargets();
            // A shared thread can acquire new IDs while the previous note is committed.
            await openNoteEditor({
              entry: notes.find((note) => note.id === entry.id) || notes[ordinal],
              canFocus: () => canFocusSelection(focusFrom),
            });
          }),
        ),
      });
      Object.assign(target.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${Math.abs(corners[1][0] - corners[0][0])}px`,
        height: `${Math.abs(corners[1][1] - corners[0][1])}px`,
      });
      // A note without its own appearance would be invisible on the canvas; show an icon.
      if (!entry.hasAppearance) {
        target.classList.add('no-appearance');
        target.style.setProperty('--note-color', entry.hex);
        target.style.setProperty('--note-ink', contrastInk(entry.hex));
        target.append(icon('StickyNote', 16, { plain: true }));
      }
      if (!entry.readOnly && !entry.propertiesLocked && access().annotate)
        makeNoteMovable(target, entry, {
          left,
          top,
          width: Math.abs(corners[1][0] - corners[0][0]),
          height: Math.abs(corners[1][1] - corners[0][1]),
        });
      noteTargets.append(target);
    }
  }
  /** Open note properties while its icon remains selected on the page. */
  function openNoteEditor(options) {
    return selectionProperties(() => showNoteEditor(options));
  }
  async function showNoteEditor({ point, entry, canFocus }) {
    if (busy || !pageReady) return;
    const focusFrom = document.activeElement;
    canFocus ??= () => canFocusSelection(focusFrom);
    cancelTextSelection();
    await finishDrafts();
    if (busy || !pageReady || destroyed || (!point && !entry)) return;
    pageImages.close();
    annotationLayer.clear();
    selectedHighlight = null;
    renderHighlightTargets();
    const textarea = el('textarea', {
      class: 'input note-text',
      rows: 4,
      maxlength: 5000,
      placeholder: '输入便签内容',
      'aria-label': entry ? '便签文本' : '新便签文本',
      spellcheck: true,
    });
    textarea.value = entry?.text || '';
    const colorPick = el('input', {
      type: 'color',
      value: entry?.hex || toolColors.note,
      'aria-label': '便签颜色',
    });
    const when = entry?.modified?.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const meta =
      entry && (entry.author || when)
        ? el('p', { class: 'note-meta muted' }, [entry.author, when].filter(Boolean).join(' · '))
        : null;
    const error = el('p', { class: 'text-edit-error', role: 'alert', hidden: true });
    // The note's replies and review status, as every other comment shows them.
    const found = entry && threadOf(entry.id);
    const thread =
      found &&
      commentThread(found, (operation, message, control) =>
        changeNoteThread(entry, operation, message, control),
      );
    const readOnly = !!entry?.readOnly || !access().annotate;
    textarea.readOnly = readOnly || !!entry?.contentsLocked;
    colorPick.disabled = readOnly || !!entry?.propertiesLocked;
    const panel = el(
      'div',
      {
        class: 'note-editor',
        role: 'group',
        'aria-label': entry ? (readOnly ? '查看便签' : '编辑便签') : '新建便签',
      },
      meta,
      textarea,
      entry?.contentsLocked && el('p', { class: 'muted' }, '此便签的文本已锁定。'),
      error,
      thread && thread.status,
      thread && thread.replies,
      thread && thread.replyText,
      thread && el('div', { class: 'annotation-actions' }, thread.replyButton),
      el(
        'div',
        { class: 'note-editor-actions' },
        colorPick,
        button(
          '关闭',
          'X',
          safe(() => finishNoteEdit()),
          'btn',
          { 'aria-label': '关闭便签' },
        ),
        entry &&
          !readOnly &&
          !entry.propertiesLocked &&
          button(
            '删除',
            'Trash2',
            safe(() => finishNoteEdit(true)),
            'btn danger',
            { 'aria-label': '删除便签' },
          ),
      ),
    );
    panel.addEventListener('keydown', (e) => {
      // Input-method confirmation and cancellation must leave the note draft intact.
      if (e.isComposing) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeNoteEditor();
        overlay.focus();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        safe(() => finishNoteEdit())();
      }
    });
    textarea.addEventListener('input', updateStatus);
    // A new icon hangs right and down from the click as the page is shown, turned or not.
    const size = NOTE_SIZE / viewport.userUnit;
    const corner = entry ? null : readerRectOnPage(point, size, size);
    noteEdit = {
      entry,
      point: entry ? { x: entry.x, y: entry.y } : { x: corner.x, y: corner.y + corner.height },
      panel,
      textarea,
      color: colorPick,
      error,
      page: pageIndex,
    };
    properties.show('note', entry ? 'Note' : '新便签', panel);
    renderNoteTargets();
    if (canFocus()) textarea.focus({ preventScroll: true });
    updateStatus();
  }
  /**
   * Reply to the open note or set its status: the note's own edit is saved first, and the
   * note opens again afterwards with the focus on the control that was used.
   */
  async function changeNoteThread(entry, operation, message, control) {
    const ordinal = notes.findIndex((note) => note.id === entry.id);
    await finishNoteEdit();
    // Saving a shared note's edit can give it a new ID; its place in the list stays.
    const current = notes.find((note) => note.id === entry.id) || notes[ordinal];
    if (!current || destroyed) return;
    await mutate((doc) => operation(doc, current.id), message, 'annotate', { retainScale: true });
    const again = notes.find((note) => note.id === current.id) || notes[ordinal];
    if (!again || destroyed || noteEdit || !['select', 'note'].includes(tool)) return;
    await openNoteEditor({ entry: again, canFocus: () => false });
    properties.root
      .querySelector(`.note-editor [aria-label="${control}"]`)
      ?.focus({ preventScroll: true });
  }
  function closeNoteEditor() {
    const open = noteEdit;
    if (!open) return;
    noteEdit = null;
    open.panel.remove();
    properties.clear('note');
    renderNoteTargets();
    updateStatus();
  }
  /** Save the open note (or remove it) and close its panel; an untouched note just closes. */
  async function finishNoteEdit(remove = false) {
    const edit = noteEdit;
    if (!edit) return;
    if (busy) throw new Error('请等待当前编辑完成。');
    const priorFocus = document.activeElement;
    const returnFocus = () => {
      if (
        document.activeElement === document.body &&
        (edit.panel.contains(priorFocus) || (!saving && !downloading))
      )
        overlay.focus({ preventScroll: true });
    };
    const text = edit.textarea.value.trim(),
      hex = edit.color.value;
    const untouched =
      !access().annotate ||
      edit.entry?.readOnly ||
      (!edit.entry && !text) ||
      (edit.entry && text === edit.entry.text && hex === edit.entry.hex);
    if (!remove && untouched) {
      closeNoteEditor();
      returnFocus();
      return;
    }
    noteEdit = null;
    // Keep the dock in place until the edit finishes. Collapsing it while saving
    // expands the workspace and clamps its scroll position, even if the edit fails.
    // WebKit can retain a textarea's native editing focus after it becomes inert.
    if (edit.panel.contains(document.activeElement)) document.activeElement.blur();
    edit.panel.inert = true;
    try {
      await mutate(
        (doc) =>
          edit.entry
            ? editNote(doc, edit.page, edit.entry.id, remove ? { remove: true } : { text, hex })
            : addNote(doc, edit.page, {
                x: edit.point.x,
                y: edit.point.y,
                text,
                hex,
                author: getUser()?.username || '',
              }),
        null,
        'annotate',
        { retainScale: true },
      );
    } catch (error) {
      noteEdit = edit;
      edit.panel.inert = false;
      properties.show('note', edit.entry ? 'Note' : '新便签', edit.panel);
      edit.error.textContent = error.message;
      edit.error.hidden = false;
      if (document.activeElement === document.body || document.activeElement === priorFocus)
        edit.textarea.focus({ preventScroll: true });
      updateStatus();
      throw error;
    }
    edit.panel.remove();
    properties.clear('note');
    if (!remove) toolColors.note = hex;
    returnFocus();
  }
  /** Ask for a signature and place it in the middle of the page, selected and ready to drag. */
  async function insertSignature() {
    const version = beginDialogRequest();
    requireAccess('edit');
    if (busy || !pageReady) return;
    await finishDrafts();
    if (!canOpenDialog(version)) return;
    const choice = await signatureDialog(dialogOptions);
    if (!choice || destroyed || busy || !pageReady) return;
    const { signature, hex, outline } = choice;
    // About a third of the page across, in the middle, upright however the page is rotated.
    const pointsAcross = viewport.width / (zoom * viewport.userUnit);
    const width = Math.min(320, Math.max(120, pointsAcross * 0.35)),
      height = width * 0.4;
    const center = pdfPoint({ x: viewport.width / 2, y: viewport.height / 2 });
    const target = { x: center.x - width / 2, y: center.y - height / 2, width, height };
    const rotation = viewport.rotation,
      index = pageIndex;
    await setTool('select');
    const priorFocus = document.activeElement;
    await mutate(
      (doc) => drawSignature(doc, index, signature, target, { hex, outline, rotation }),
      '已添加签名。拖动可移动或调整大小。',
    );
    const entry = imageRunCache
      .get(pageIndex)
      ?.filter((entry) => (signature.type === 'image') === (entry.kind === 'image'))
      .at(-1);
    if (entry)
      pageImages.selectOrdinal(
        entry.ordinal,
        document.activeElement === document.body || document.activeElement === priorFocus,
      );
    revealPlaced();
  }
  /**
   * A signature or stamp lands in the middle of the page, which on a phone can be below what
   * is in view once the selection's properties dock opens; the view follows it there.
   */
  function revealPlaced() {
    const frame = editorRoot.querySelector('.image-move');
    if (!frame) return;
    // Only the page view scrolls, and the corner handles that stand out past the edges show too.
    const box = frame.getBoundingClientRect(),
      margin = 16;
    revealBox({
      top: box.top - margin,
      bottom: box.bottom + margin,
      left: box.left - margin,
      right: box.right + margin,
      width: box.width + 2 * margin,
      height: box.height + 2 * margin,
    });
  }
  /** A stamp lands centered like a signature and is selected for moving and resizing. */
  async function insertStamp() {
    const version = beginDialogRequest();
    requireAccess('edit');
    if (busy || !pageReady) return;
    await finishDrafts();
    if (!canOpenDialog(version) || busy || !pageReady) return;
    const pointsAcross = viewport.width / (zoom * viewport.userUnit);
    const width = Math.min(260, Math.max(110, pointsAcross * 0.32)),
      height = width * 0.45;
    const choice = await stampDialog({ ...dialogOptions, size: { width, height } });
    if (!choice || destroyed || busy || !pageReady) return;
    const center = pdfPoint({ x: viewport.width / 2, y: viewport.height / 2 });
    const target = { x: center.x - width / 2, y: center.y - height / 2, width, height };
    const rotation = viewport.rotation,
      index = pageIndex;
    await setTool('select');
    const priorFocus = document.activeElement;
    await mutate(
      (doc) => drawStamp(doc, index, choice, target, { rotation }),
      '已添加图章。拖动可移动或调整大小。',
    );
    const entry = imageRunCache
      .get(pageIndex)
      ?.filter((entry) => entry.kind !== 'image')
      .at(-1);
    if (entry)
      pageImages.selectOrdinal(
        entry.ordinal,
        document.activeElement === document.body || document.activeElement === priorFocus,
      );
    revealPlaced();
  }
  /**
   * The working copy for a dialog to read, or null when the editor closed or the document
   * changed while it was being parsed, so a dialog never opens over the library or on a stale
   * copy after a quick Back, Undo, or edit.
   */
  async function workingDocument(version = dialogVersion()) {
    const revision = session.revision;
    const doc = editDocument || (await loadPdfDocument(session.bytes, { updateMetadata: false }));
    if (!canOpenDialog(version) || busy || session.revision !== revision) return null;
    editDocument = doc;
    return doc;
  }
  async function formDialog() {
    const version = beginDialogRequest();
    requireAccess('fill');
    if (busy) return;
    await finishDrafts();
    const doc = await workingDocument(version);
    if (!doc) return;
    // Push buttons hold nothing to fill in.
    const fields = listFields(doc).filter((field) => !field.button);
    if (!fields.some((field) => field.type !== 'unsupported')) {
      // An XFA form keeps its fields in XFA alone, which only Adobe's readers fill in; what
      // its pages show here is usually a note to that effect.
      const xfa = await pdf
        .getMetadata()
        .then(({ info }) => !!info?.IsXFAPresent)
        .catch(() => false);
      if (!canOpenDialog(version)) return;
      toast(
        xfa
          ? '此 PDF 是 XFA 表单，只能在 Adobe Acrobat 或 Adobe Reader 中填写。请使用“文本”工具在页面上书写。'
          : fields.some((field) => field.signature)
            ? '此 PDF 没有可填写的表单字段。请使用“使用证书签名”签署其签名字段。'
            : '此 PDF 没有可填写的表单字段。请使用“文本”工具在页面上书写。',
      );
      return;
    }
    const controls = new Map();
    const changed = new WeakSet();
    const form = el(
      'form',
      {
        class: 'stack',
        oninput: (event) => changed.add(event.target),
        onchange: (event) => changed.add(event.target),
      },
      el(
        'p',
        { class: 'muted' },
        '完成此 PDF 的现有表单字段。更改将在保存表单时生效。',
      ),
    );
    fields.forEach((field, i) => {
      if (field.type === 'unsupported') {
        form.append(
          el(
            'p',
            { class: 'muted' },
            field.signature
              ? `${field.tooltip || field.name}: a signature field. Sign it with Sign with a certificate.`
              : `${field.tooltip || field.name}: this field type is not editable here.`,
          ),
        );
        return;
      }
      const id = `field-${i}`;
      let control, inputOptions;
      if (field.type === 'checkbox')
        control = el('input', {
          type: 'checkbox',
          id,
          checked: field.value,
          disabled: field.readOnly,
        });
      else if (field.editableChoice) {
        inputOptions = choiceInputOptions(field.choices);
        const list = `${id}-options`;
        control = el('input', {
          id,
          type: 'text',
          class: 'input',
          list,
          placeholder: '选择或输入选项',
          autocomplete: 'off',
          spellcheck: String(field.spellcheck),
          disabled: field.readOnly,
        });
        const selected = Array.isArray(field.value) ? field.value[0] : field.value;
        control.value =
          selected == null
            ? ''
            : inputOptions.find((choice) => choice.value === selected)?.label ||
              selected ||
              '(空选项)';
        form.append(
          el(
            'datalist',
            { id: list },
            ...inputOptions.map((choice) => el('option', { value: choice.label })),
          ),
        );
      } else if (field.type === 'select')
        control = el(
          'select',
          { id, class: 'input', multiple: field.multiple, disabled: field.readOnly },
          !field.multiple &&
            el('option', { value: '', 'data-placeholder': true }, '请选择一个选项'),
          ...field.options.map((option) =>
            el(
              'option',
              {
                value: option,
                selected: Array.isArray(field.value)
                  ? field.value.includes(option)
                  : option === field.value,
              },
              field.choices?.find((choice) => choice.value === option)?.label ||
                option ||
                '(Empty option)',
            ),
          ),
        );
      else {
        control = el(field.multiline ? 'textarea' : 'input', {
          id,
          type: field.multiline ? null : field.password ? 'password' : 'text',
          class: 'input',
          maxlength: field.maxLength,
          disabled: field.readOnly,
          autocomplete: field.password ? 'off' : null,
          spellcheck: String(field.spellcheck),
        });
        control.value = field.value;
      }
      // Required, not enforced: a form can be saved while it is being filled in.
      if (field.required) control.setAttribute('aria-required', 'true');
      controls.set(field.name, { control, field, inputOptions });
      form.append(
        el(
          'div',
          { class: field.type === 'checkbox' ? 'checkbox-row' : 'field' },
          // A tooltip is the form author's label for people; field names are often codes.
          el(
            'label',
            { for: id, title: field.tooltip ? field.name : null },
            (field.tooltip || field.name) +
              (field.readOnly ? '（只读）' : field.required ? '（必填）' : ''),
          ),
          control,
        ),
      );
    });
    const apply = safe(async () => {
      if (!form.reportValidity()) return;
      const values = Object.create(null);
      controls.forEach(({ control, field, inputOptions }, key) => {
        // Native controls can normalize the source value without any user edit.
        if (field.readOnly || !changed.has(control)) return;
        if (field.type === 'checkbox') values[key] = control.checked;
        else if (field.editableChoice)
          values[key] = control.value
            ? [
                inputOptions.find((choice) => choice.label === control.value)?.value ??
                  control.value,
              ]
            : [];
        else if (field.type === 'select')
          values[key] = [...control.selectedOptions]
            .filter((o) => !o.hasAttribute('data-placeholder'))
            .map((o) => o.value);
        else values[key] = control.value;
      });
      try {
        await mutateDialog(d, (doc) => fillFields(doc, values), '表单已保存。', 'fill');
      } catch (error) {
        // A value refused for its field: the message shows, then the field takes the focus.
        const refused = d.open && controls.get(error?.field)?.control;
        if (!refused) throw error;
        toast(error.message, { error: true });
        refused.setAttribute('aria-invalid', 'true');
        refused.addEventListener('input', () => refused.removeAttribute('aria-invalid'), {
          once: true,
        });
        refused.focus();
      }
    });
    form.onsubmit = (e) => {
      e.preventDefault();
      apply();
    };
    const d = modal('填写表单', form, [
      button('取消', null, () => d.close()),
      button('保存表单', 'Check', apply, 'btn primary'),
    ]);
  }
  /** Resolve after page operations and queued history, including their redraws, settle. */
  const idle = (includeHistory = true) =>
    new Promise((resolve) => {
      const check = () =>
        !destroyed && (busy || (includeHistory && pendingHistory))
          ? setTimeout(check, 50)
          : resolve();
      check();
    });
  /** A question with a few answers: the chosen value, or 'cancel' when the dialog is dismissed. */
  function choose(title, message, choices) {
    return new Promise((resolve) => {
      const d = modal(
        title,
        el('p', {}, message),
        choices.map(([label, value, style]) =>
          button(
            label,
            null,
            () => {
              resolve(value);
              d.close();
            },
            style,
          ),
        ),
      );
      d.addEventListener('close', () => resolve('cancel'), { once: true });
    });
  }
  const reasonOf = (error) =>
    String(error?.message || error?.error?.message || (typeof error === 'string' ? error : ''))
      .trim()
      .replace(/\.$/, '');
  /**
   * Before a save replaces the cloud file this PDF came from, check it is still that file as
   * it was read or last written here. Someone may have saved it since from another window or
   * device, or moved, renamed, or deleted it. A file that moved is followed (it keeps its id);
   * anything else is put to the reader, since overwriting would quietly lose someone's work.
   * Resolves `{ path, name }` to write, null to save a new copy instead, or false to stop.
   */
  async function confirmDestination(target, signal) {
    const here = { path: target, name };
    if (!remote?.modified || !P.canStat()) return here;
    const look = (what) =>
      waitFor(() => P.statFile(what), signal).catch((error) => {
        if (signal.aborted) throw error;
        // A check that cannot be made is no reason to refuse the save: the write itself
        // reports a real failure.
        return undefined;
      });
    let file = await look(target),
      moved = false;
    if (file === undefined) return here;
    if (!file && remote.uid) {
      const found = await look({ uid: remote.uid });
      if (found && !found.dir && !P.inTrash(found.path) && /\.pdf$/i.test(found.name)) {
        file = found;
        moved = true;
      }
    }
    if (destroyed) return false;
    if (!file) {
      const choice = await choose(
        '此 PDF 已被移动或删除',
        `${name} is no longer where it was opened from in local storage. Your changes are still here: save them as a new file, or put the file back where it was.`,
        [
          ['继续编辑', 'cancel'],
          ['恢复原文件', 'restore'],
          ['另存为新文件', 'copy', 'btn primary'],
        ],
      );
      return choice === 'restore' ? here : choice === 'copy' ? null : false;
    }
    // A move or rename can restamp the file without changing it; only its size tells then.
    const changed = file.size !== remote.size || (!moved && file.modified > remote.modified);
    if (!changed) return { path: file.path, name: file.name };
    const choice = await choose(
      '此 PDF 已在别处被更改',
      `${file.name} was saved in local storage after you opened it here, perhaps in another window or on another device. Replace that version with yours, or keep both by saving yours as a new file.`,
      [
        ['继续编辑', 'cancel'],
        ['替换它', 'replace', 'btn danger'],
        ['另存为新文件', 'copy', 'btn primary'],
      ],
    );
    return choice === 'replace'
      ? { path: file.path, name: file.name }
      : choice === 'copy'
        ? null
        : false;
  }
  /**
   * A failed write as an Error to show. The SDK rejects with plain objects too, at times with
   * the reason nested inside, which the generic message would otherwise replace.
   */
  function saveFailure(error) {
    if (error instanceof Error || P.isSignInCancelled(error)) return error;
    const reason = reasonOf(error);
    return new Error(`Puter could not save ${name}${reason ? `: ${reason}` : ''}.`);
  }
  /** After a failed write to an existing file: whether to keep the changes as a new file. */
  async function offerCopy(error) {
    const reason = reasonOf(error);
    return (
      (await choose(
        '无法保存此 PDF',
        `Puter could not save ${name}${reason ? ` (${reason})` : ''}. Your changes are still here. Save them as a new file in your PDF Editor folder instead?`,
        [
          ['继续编辑', 'cancel'],
          ['另存为新文件', 'copy', 'btn primary'],
        ],
      )) === 'copy'
    );
  }
  /** The file as just written, for the next save's check; null when it cannot be described. */
  async function written(item, filePath, size, signal) {
    const info = P.fileInfo(item);
    if (info?.modified) return { ...info, size };
    if (!P.canStat()) return null;
    const file = await waitFor(() => P.statFile(info?.path || filePath), signal).catch((error) => {
      if (signal?.aborted) throw error;
      return null;
    });
    return file?.modified ? { ...file, size } : null;
  }
  let runningSave = null;
  function save(asCopy = false) {
    if (saving) return;
    return (runningSave = saveNow(asCopy));
  }
  async function saveNow(asCopy) {
    const token = ++saveGeneration;
    const controller = (saveController = new AbortController());
    const { signal } = controller;
    const priorFocus = document.activeElement;
    // Claimed before the first await: settling drafts takes a turn of the event loop, and a
    // second press in that turn (a double click, or the shortcut twice) would otherwise write
    // the file a second time, which for a new file means a second, deduplicated copy of it.
    saving = true;
    updateStatus();
    try {
      // A save asked for during a page operation (the shortcut, or leaving) goes after it.
      await waitFor(idle, signal);
      if (destroyed || token !== saveGeneration) return;
      await waitFor(finishDrafts, signal);
      if (destroyed || token !== saveGeneration) return;
      const revision = session.revision,
        savedProtection = protection;
      let targetName = name,
        targetPath = asCopy ? null : path;
      const bytes = await waitFor(exportBytes, signal);
      if (destroyed || token !== saveGeneration) return;
      if (!getUser()) await waitFor(() => signIn(signal), signal);
      if (destroyed || token !== saveGeneration) return;
      const current = () => !destroyed && token === saveGeneration && !signal.aborted;
      if (targetPath) {
        const destination = await confirmDestination(targetPath, signal);
        if (!current() || destination === false) return;
        targetPath = destination?.path ?? null;
        if (destination) targetName = destination.name;
      }
      let item;
      try {
        item = await waitFor(() => P.saveFile(targetName, bytes, targetPath), signal);
      } catch (error) {
        // An existing file that cannot be written (shared to view only, its folder gone) need
        // not cost the changes: offer to keep them as a new file in the app's own folder.
        // Without a connection a new file could not be written either.
        if (!targetPath || !current() || P.isConnectionFailure(error)) throw saveFailure(error);
        if (!(await offerCopy(error)) || !current()) return;
        targetPath = null;
        item = await waitFor(() => P.saveFile(targetName, bytes, null), signal).catch((e) => {
          throw saveFailure(e);
        });
      }
      if (!getUser()) await waitFor(() => signIn(signal), signal);
      if (!destroyed && token === saveGeneration) {
        const created = !targetPath;
        path = item?.path || targetPath || `${P.FOLDER}/${item?.name || targetName}`;
        name = item?.name || path.split('/').pop() || targetName;
        session.markSaved(revision);
        cloudRevision = revision;
        if (protection === savedProtection) protectionDirty = false;
        remote = await written(item, path, bytes.length, signal);
        if (destroyed || token !== saveGeneration) return;
        toast(created ? `已保存到本地存储：“${name}”。` : 'PDF 已保存到本地存储。');
      }
    } catch (error) {
      if (!signal.aborted) throw error;
    } finally {
      if (saveController === controller) {
        saveController = null;
        saving = false;
        if (!destroyed) {
          updateStatus();
          // Disabling the save control can drop keyboard focus while drafts are committed.
          if (document.activeElement === document.body && priorFocus?.isConnected)
            priorFocus.focus({ preventScroll: true });
        }
      }
    }
  }
  /** A file name for part of this PDF: its name, already trimmed to leave room, then `suffix`. */
  const exportName = (suffix) => `${safeName(name).replace(/\.pdf$/i, '')}${suffix}.pdf`;
  /** The bytes that leave the editor: the working copy, encrypted when a password is set. */
  async function exportBytes(bytes = session.bytes.slice(), savedProtection = protection) {
    const output = savedProtection ? await protectPdf(bytes, savedProtection) : bytes;
    if (output.length > MAX_FILE_SIZE)
      throw new Error(
        '导出文件将超过 100 MB 的 PDF 限制。请在保存或下载前减小文件大小。',
      );
    return output;
  }
  async function downloadPdf() {
    // Claimed before the first await, so a second press while a protected PDF is being
    // encrypted cannot hand the browser a second copy of the same file.
    if (downloading) return;
    const priorFocus = document.activeElement;
    downloading = true;
    updateStatus();
    let bytes;
    try {
      await idle();
      if (destroyed) return;
      await finishDrafts();
      if (destroyed) return;
      const revision = session.revision,
        savedProtection = protection;
      activity = protection ? '正在加密…' : null;
      updateStatus();
      try {
        bytes = await exportBytes();
      } finally {
        // The status bar must not keep saying "Encrypting…" when the export fails.
        activity = null;
      }
      if (destroyed) return;
      download(bytes, name);
      downloadedRevision = revision;
      // For a file kept in Puter a download is a copy: the Puter file still lacks the changes.
      if (!path) {
        session.markSaved(revision);
        if (protection === savedProtection) protectionDirty = false;
      }
      toast(protection ? '密码保护的 PDF 已下载。' : 'PDF 已下载。');
    } finally {
      downloading = false;
      if (!destroyed) {
        updateStatus();
        // Restore only lost focus; another control may have been chosen during the export.
        if (document.activeElement === document.body && priorFocus?.isConnected)
          priorFocus.focus({ preventScroll: true });
      }
    }
  }
  async function unlockOwner(request = { version: beginDialogRequest() }) {
    if (busy || destroyed) return false;
    await finishDrafts();
    if (!canOpenDialog(request.version)) return false;
    const current = protection;
    const next = await promptOwner(current, {
      ...dialogOptions,
      isCurrent: () => !destroyed && request.version === dialogVersion(),
      onOpen: () => (request.version = dialogVersion()),
    });
    if (!next || destroyed || protection !== current) return false;
    protection = next;
    await setTool(tool);
    if (destroyed || protection !== next) return false;
    await renderPage();
    if (destroyed || protection !== next) return false;
    updateStatus();
    toast('已解锁编辑权限。PDF 将保留现有保护设置。');
    return true;
  }
  /** Set, change, or remove the password applied when the PDF is downloaded or saved. */
  async function securityDialog() {
    if (busy) return;
    const request = { version: beginDialogRequest() };
    // Encrypting needs Web Crypto, which a page served over plain http does not have; say so
    // before a password is typed rather than at the download that would fail.
    if (!passwordsSupported())
      throw new Error('密码保护需要安全连接。请通过 https 打开此页面。');
    if (!access().owner && !(await unlockOwner(request))) return;
    // Authentication still unlocks editing, but a later dialog retires this follow-up.
    if (!canOpenDialog(request.version)) return;
    const next = await protectDialog(protection, dialogOptions);
    if (next === undefined || destroyed) return;
    await setProtection(next);
  }
  async function setProtection(next) {
    requireAccess('owner');
    // Adding, changing, or removing a password rewrites the whole file, as an edit does.
    if (!(await confirmSignedEdit()) || destroyed) return;
    protection = next;
    protectionDirty = true;
    updateStatus();
    toast(
      next
        ? '密码将在下载或保存时生效。'
        : '密码将在下载或保存时移除。',
    );
  }
  async function saveAs() {
    if (saving) return;
    const token = ++saveGeneration;
    await idle();
    if (saving || destroyed || token !== saveGeneration) return;
    await finishDrafts();
    if (destroyed || token !== saveGeneration) return;
    if (!getUser()) await signIn();
    if (destroyed || token !== saveGeneration) return;
    const revision = session.revision,
      savedProtection = protection;
    let size = 0;
    // A cancelled Puter save picker can remain pending. Never lock the editor on it.
    exportBytes()
      .then(async (bytes) => {
        // Encryption can finish after a rename, replacement, or newer save. Do not open
        // an obsolete picker (or suggest the newer working copy's name for older bytes).
        if (destroyed || token !== saveGeneration) return;
        if (!getUser()) await signIn();
        if (destroyed || token !== saveGeneration) return;
        size = bytes.length;
        return P.saveAs(name, bytes);
      })
      .then(async (item) => {
        if (destroyed || token !== saveGeneration || !item) return;
        if (!getUser()) await signIn();
        if (destroyed || token !== saveGeneration) return;
        path = item.path || path;
        name = item.name || name;
        session.markSaved(revision);
        cloudRevision = revision;
        if (protection === savedProtection) protectionDirty = false;
        // The picker wrote a new file: later saves check that one, not the file opened before.
        remote = null;
        updateStatus();
        toast(`已另存为本地文件：“${name}”。`);
        const savedPath = path;
        const info = await written(item, savedPath, size);
        if (!destroyed && token === saveGeneration && path === savedPath) remote = info;
      })
      .catch((e) => {
        // A refusal says why; only a rejection without any reason reads as a cancel.
        if (!destroyed && token === saveGeneration)
          toast(reasonOf(e) ? saveFailure(e).message : '已取消保存。', { error: true });
      });
  }
  /* ---------- Menus ---------- */
  /** A page operation first settles any open draft, as navigation and saving do. */
  const pageAction = (fn) =>
    safe(async () => {
      await finishDrafts();
      await fn();
    });
  const canOpenDialog = (version) =>
    !destroyed && version === dialogVersion() && !document.querySelector('dialog[open]');
  /** A newer dialog choice retires pending preparation without cancelling the draft save. */
  const pageDialog = (fn) =>
    safe(async () => {
      const version = beginDialogRequest();
      try {
        await finishDrafts();
        if (canOpenDialog(version)) await fn(version);
      } catch (error) {
        if (canOpenDialog(version)) throw error;
      }
    });
  /** Menu entries as tool pane commands: submenus are spread out and headers dropped. */
  function menuCommands(items) {
    return permissionMenu(items.filter(Boolean)).flatMap((item) =>
      item.separator || item.header
        ? []
        : item.items
          ? menuCommands(item.items)
          : [
              {
                label: item.label,
                glyph: item.icon,
                onSelect: item.onSelect,
                disabled: item.disabled,
                danger: item.danger,
                shortcut: item.shortcut,
              },
            ],
    );
  }
  const toolPressed = (id) => tool === id;
  /**
   * Every tool in the tools pane. Entries are read when the pane draws, so their enabled and
   * pressed states are current; commands run through the same guards as the menus.
   */
  function toolCatalog() {
    const noDocument = () => busy || !pdf;
    return [
      {
        id: 'export',
        label: '导出 PDF',
        group: '创建与编辑',
        featured: true,
        description: '将 PDF 或其页面保存为其他格式。',
        sections: () => [
          {
            title: '导出为',
            items: [
              ...[
                ['docx', 'Microsoft Word (.docx) 文档…', 'export-docx'],
                ['xlsx', '电子表格 (.xlsx)…', 'export-xlsx'],
                ['pptx', '演示文稿 (.pptx)…', 'export-pptx'],
                ['rtf', '富文本 (.rtf)…', 'export-rtf'],
                ['html', '网页 (.html)…', 'export-html'],
                ['txt', '纯文本 (.txt)…', 'export-txt'],
              ].map(([format, label, glyph]) => ({
                label,
                icon: glyph,
                permission: 'copy',
                disabled: noDocument(),
                onSelect: () => pageDialog(() => officeExportDialog(format))(),
              })),
              {
                label: '图片 (PNG 或 JPEG)…',
                icon: 'export-image',
                permission: 'copy',
                disabled: noDocument(),
                onSelect: () => pageDialog(pageImagesDialog)(),
              },
              {
                label: '将此页保存为图片',
                glyph: 'ImageDown',
                permission: 'copy',
                disabled: noDocument(),
                onSelect: () => pageAction(() => downloadPageImage(pageIndex))(),
              },
              {
                label: 'PDF 副本',
                glyph: 'Download',
                disabled: busy,
                onSelect: () => safe(downloadPdf)(),
              },
            ],
          },
        ],
      },
      {
        id: 'edit',
        label: '编辑 PDF',
        group: 'Create & Edit',
        featured: true,
        description: '修改文本和图片，或向页面添加新内容。',
        permission: 'edit',
        sections: () => [
          {
            title: '添加内容',
            items: [
              {
                label: '添加文本',
                icon: 'add-text',
                pressed: toolPressed('text'),
                permission: 'edit',
                hint: '点击现有文本即可编辑',
                onSelect: () => safe(() => setTool('text'))(),
              },
              {
                label: '添加图片',
                icon: 'add-image',
                permission: 'edit',
                disabled: busy,
                onSelect: () => safe(insertImage)(),
              },
              {
                label: '添加链接',
                icon: 'link',
                pressed: toolPressed('link'),
                permission: 'annotate',
                disabled: noDocument(),
                onSelect: () => pageAction(() => setTool('link'))(),
              },
            ],
          },
          {
            title: '编辑内容',
            items: [
              {
                label: '编辑文本和图片',
                icon: 'edit',
                pressed: toolPressed('select'),
                hint: '双击文本；拖动图片和形状',
                onSelect: () => safe(() => setTool('select'))(),
              },
              {
                label: '裁剪页面',
                icon: 'crop',
                pressed: toolPressed('crop'),
                permission: 'edit',
                disabled: busy,
                onSelect: () => pageAction(() => setTool('crop'))(),
              },
            ],
          },
          {
            title: '页面设计',
            items: [
              {
                label: '页眉和页脚…',
                icon: 'header-footer',
                permission: 'edit',
                disabled: noDocument(),
                onSelect: () => pageDialog(headerFooterDialog)(),
              },
              {
                label: '水印…',
                icon: 'watermark',
                permission: 'edit',
                disabled: noDocument(),
                onSelect: () => pageDialog(watermarkDialog)(),
              },
              {
                label: '页码…',
                icon: 'page-numbers',
                permission: 'edit',
                disabled: noDocument(),
                onSelect: () => pageDialog(pageNumbersDialog)(),
              },
              {
                label: '贝茨编号…',
                icon: 'bates',
                permission: 'edit',
                disabled: noDocument(),
                onSelect: () =>
                  pageDialog((version) => headerFooterDialog(version, { bates: true }))(),
              },
              {
                label: '清除页眉和页脚',
                icon: 'remove-header-footer',
                permission: 'edit',
                hint: '包括页码和贝茨编号',
                disabled: noDocument(),
                onSelect: () => safe(() => removeMarks(['Header', 'Footer']))(),
              },
              {
                label: '清除水印',
                icon: 'remove-watermark',
                permission: 'edit',
                disabled: noDocument(),
                onSelect: () => safe(() => removeMarks(['Watermark']))(),
              },
            ],
          },
        ],
      },
      {
        id: 'create',
        label: '创建 PDF',
        group: 'Create & Edit',
        featured: true,
        description: '创建新 PDF，或将图片转为 PDF 页面。',
        sections: () => [
          {
            title: '创建',
            items: [
              { label: '空白 PDF', icon: 'create', onSelect: () => onNew() },
              {
                label: '来自此设备上的图片或 PDF…',
                glyph: 'FolderOpen',
                onSelect: () => onOpen(),
              },
              onOpenCloud && {
                label: 'From Local…',
                glyph: 'Cloud',
                onSelect: () => onOpenCloud(),
              },
            ],
          },
          {
            title: '添加到此 PDF',
            items: [
              {
                label: '插入图片作为页面…',
                glyph: 'Images',
                permission: 'assemble',
                disabled: busy,
                onSelect: () => pageAction(() => insertPicturePages(pageIndex))(),
              },
            ],
          },
        ],
      },
      {
        id: 'combine',
        label: '合并文件',
        group: 'Create & Edit',
        featured: true,
        keywords: 'merge join pdfs pictures images',
        description: '将多个 PDF 和图片合并为一个新 PDF。',
        run: () =>
          onOpenBytes
            ? pageDialog(combineDialog)()
            : pageDialog((version) => mergeDialog(pageIndex, version))(),
      },
      {
        id: 'organize',
        label: '组织页面',
        group: 'Create & Edit',
        featured: true,
        keywords: 'rotate delete move reorder insert extract duplicate split pages',
        description:
          '在网格中选择页面，然后旋转、移动、插入、提取或删除。拖动页面调整顺序。',
        enter: () => openOrganizer(),
        leave: () => closeOrganizer(),
        takesView: true,
        // The commands act on the pages selected in the grid, or the current page.
        sections: () => {
          const chosen =
            organizer.visible && organizer.selection.length ? organizer.selection : [pageIndex];
          const label = chosen.length === 1 ? `第 ${chosen[0] + 1} 页` : `${chosen.length} 个页面`;
          const after = chosen.at(-1);
          const run = (fn) => () => safe(fn)();
          return [
            {
              title: label,
              items: [
                {
                  label: '顺时针旋转',
                  glyph: 'RotateCw',
                  permission: 'assemble',
                  disabled: busy,
                  onSelect: run(() => organizeActions.rotate(chosen, 90)),
                },
                {
                  label: '逆时针旋转',
                  glyph: 'RotateCcw',
                  permission: 'assemble',
                  disabled: busy,
                  onSelect: run(() => organizeActions.rotate(chosen, -90)),
                },
                ...[
                  [-1, 'earlier', 'ArrowLeft'],
                  [1, 'later', 'ArrowRight'],
                ].map(([delta, word, glyph]) => ({
                  label: word === 'earlier' ? '向前移动' : '向后移动',
                  glyph,
                  permission: 'assemble',
                  disabled: busy || !organizer.canMove(delta),
                  onSelect: () => organizer.move(delta),
                })),
                {
                  label: '复制页面',
                  glyph: 'Copy',
                  permission: 'assemble',
                  disabled: busy,
                  onSelect: run(() =>
                    // The grid keeps its choice on the pages that were duplicated.
                    organizer.visible ? organizer.duplicate() : organizeActions.duplicate(chosen),
                  ),
                },
                {
                  label: '提取页面',
                  icon: 'extract',
                  permission: 'copy',
                  disabled: busy,
                  onSelect: run(() => organizeActions.extract(chosen)),
                },
                {
                  label: '删除页面',
                  glyph: 'Trash2',
                  danger: true,
                  permission: 'assemble',
                  disabled: busy || !pdf || chosen.length >= pdf.numPages,
                  onSelect: run(() =>
                    organizer.visible ? organizer.remove() : organizeActions.remove(chosen),
                  ),
                },
              ],
            },
            {
              title: `在第 ${after + 1} 页后插入`,
              items: [
                {
                  label: '空白页',
                  glyph: 'FilePlus2',
                  permission: 'assemble',
                  disabled: busy,
                  onSelect: run(() => organizeActions.insertBlank(after)),
                },
                {
                  label: '来自 PDF 文件…',
                  icon: 'insert-pages',
                  permission: 'assemble',
                  disabled: busy,
                  onSelect: () => organizeActions.insertFile(after),
                },
                {
                  label: '图片…',
                  glyph: 'Images',
                  permission: 'assemble',
                  disabled: busy,
                  onSelect: () => organizeActions.insertPictures(after),
                },
              ],
            },
            {
              title: '整个文档',
              items: [
                {
                  label: '拆分 PDF…',
                  icon: 'split',
                  permission: 'copy',
                  disabled: noDocument() || pdf.numPages < 2,
                  onSelect: () => pageDialog(splitDialog)(),
                },
                {
                  label: '旋转所有页面',
                  glyph: 'RotateCw',
                  permission: 'assemble',
                  disabled: busy,
                  onSelect: run(() => mutate((doc) => rotateAllPages(doc), null, 'assemble')),
                },
              ],
            },
          ];
        },
      },
      {
        id: 'comment',
        label: '添加批注',
        group: '审阅',
        featured: true,
        description: '添加便签、高亮文本并标记页面。',
        permission: 'annotate',
        enter: () => {
          showSidebarTab('comments');
          if (editorRoot.classList.contains('hide-pages')) toggleSidebar(true);
        },
        sections: () => [
          {
            title: '批注',
            items: [
              {
                label: '便签',
                icon: 'sticky-note',
                pressed: toolPressed('note'),
                permission: 'annotate',
                onSelect: () => safe(() => setTool('note'))(),
              },
              {
                label: '高亮文本',
                glyph: 'Highlighter',
                pressed: toolPressed('highlight') && markupKind.value === 'highlight',
                permission: 'annotate',
                onSelect: () => safe(() => setMarkup('highlight'))(),
              },
              {
                label: '下划线',
                glyph: 'Underline',
                pressed: toolPressed('highlight') && markupKind.value === 'underline',
                permission: 'annotate',
                onSelect: () => safe(() => setMarkup('underline'))(),
              },
              {
                label: '删除线',
                glyph: 'Strikethrough',
                pressed: toolPressed('highlight') && markupKind.value === 'strikeout',
                permission: 'annotate',
                onSelect: () => safe(() => setMarkup('strikeout'))(),
              },
              {
                label: '添加文本批注',
                icon: 'add-text',
                pressed: toolPressed('textbox'),
                permission: 'annotate',
                onSelect: () => safe(() => setTool('textbox'))(),
              },
              {
                label: '标注框',
                icon: 'callout',
                pressed: toolPressed('callout'),
                permission: 'annotate',
                onSelect: () => safe(() => setTool('callout'))(),
              },
              {
                label: '画笔',
                glyph: 'Pencil',
                pressed: toolPressed('pencil'),
                permission: 'annotate',
                onSelect: () => safe(() => setTool('pencil'))(),
              },
              {
                label: '形状',
                glyph: 'Square',
                pressed: toolPressed('cshape'),
                permission: 'annotate',
                hint: '矩形、椭圆、线条、箭头或云朵',
                onSelect: () => safe(() => setTool('cshape'))(),
              },
              {
                label: '添加印章…',
                icon: 'stamp',
                permission: 'edit',
                disabled: busy,
                onSelect: () => safe(insertStamp)(),
              },
            ],
          },
          {
            title: '共享批注',
            items: [
              {
                label: '导出批注 (XFDF)',
                glyph: 'Download',
                disabled: noDocument(),
                onSelect: () => safe(() => exportComments('xfdf'))(),
              },
              {
                label: '导入批注…',
                glyph: 'Upload',
                permission: 'annotate',
                disabled: noDocument(),
                onSelect: () => importComments(),
              },
              {
                label: '批注摘要',
                glyph: 'FileText',
                disabled: noDocument(),
                onSelect: () => safe(() => exportComments('summary'))(),
              },
            ],
          },
        ],
      },
      {
        id: 'fill-sign',
        label: '填写与签名',
        group: '表单与签名',
        featured: true,
        description: '填写表单并添加您的签名。',
        sections: () => [
          {
            title: '填写',
            items: [
              {
                label: '填写表单字段…',
                icon: 'form',
                permission: 'fill',
                disabled: busy,
                onSelect: () => safe(formDialog)(),
              },
              {
                label: '添加文本',
                icon: 'add-text',
                pressed: toolPressed('text'),
                permission: 'edit',
                onSelect: () => safe(() => setTool('text'))(),
              },
              {
                label: '对勾或叉号',
                icon: 'field-checkbox',
                pressed: toolPressed('shape') && ['check', 'cross'].includes(shapeSelect.value),
                permission: 'edit',
                onSelect: () =>
                  safe(async () => {
                    if (!['check', 'cross'].includes(shapeSelect.value))
                      shapeSelect.value = 'check';
                    await setTool('shape');
                  })(),
              },
            ],
          },
          {
            title: '签名',
            items: [
              {
                label: '添加签名…',
                icon: 'fill-sign',
                permission: 'edit',
                disabled: busy,
                onSelect: () => safe(insertSignature)(),
              },
              {
                label: '使用证书签名',
                icon: 'certificate',
                pressed: toolPressed('certsign'),
                permission: 'fill',
                hint: '数字 ID 证明签署人身份',
                disabled: noDocument(),
                onSelect: () => pageAction(() => setTool('certsign'))(),
              },
            ],
          },
        ],
      },
      {
        id: 'form',
        label: '准备表单',
        group: 'Forms & Signatures',
        featured: true,
        permission: 'edit',
        keywords: 'form fields fillable acroform text field checkbox radio dropdown',
        description:
          '添加可填写的字段：选择字段类型，然后在页面上拖动框选或点击放置。双击字段打开属性。',
        enter: () => setPreparing(true),
        leave: () => {
          setPreparing(false);
          if (tool === 'field') safe(() => setTool('select'))();
        },
        sections: () => {
          const types = [
            ['text', '文本字段', 'field-text'],
            ['checkbox', '复选框', 'field-checkbox'],
            ['radio', '单选按钮', 'field-radio'],
            ['dropdown', '下拉列表', 'field-dropdown'],
            ['listbox', '列表框', 'field-listbox'],
            ['date', '日期字段', 'field-date'],
            ['button', '按钮', 'field-button'],
            ['signature', '签名字段', 'field-signature'],
          ];
          const onPage = formFields.filter((field) => field.page === pageIndex);
          return [
            {
              title: '添加字段',
              items: types.map(([type, label, glyph]) => ({
                label,
                icon: glyph,
                pressed: tool === 'field' && fieldType === type,
                permission: 'edit',
                disabled: noDocument(),
                onSelect: () =>
                  safe(async () => {
                    fieldType = type;
                    await setTool('field');
                  })(),
              })),
            },
            {
              title: '发现字段',
              items: [
                {
                  label: '自动检测表单字段…',
                  glyph: 'find',
                  permission: 'edit',
                  disabled: noDocument(),
                  onSelect: () => pageDialog(detectFieldsDialog)(),
                },
                {
                  label: 'Tab 键顺序：按行',
                  glyph: 'ListChecks',
                  permission: 'edit',
                  disabled: noDocument() || !formFields.length,
                  onSelect: () => safe(() => orderFieldTabs('row'))(),
                },
                {
                  label: 'Tab 键顺序：按列',
                  glyph: 'ListChecks',
                  permission: 'edit',
                  disabled: noDocument() || !formFields.length,
                  onSelect: () => safe(() => orderFieldTabs('column'))(),
                },
              ],
            },
            {
              title: onPage.length
                ? `第 ${pageIndex + 1} 页上的字段（共 ${formFields.length} 个）`
                : `第 ${pageIndex + 1} 页无字段`,
              items: onPage.slice(0, 60).map((field) => ({
                // The buttons of a radio group share its name; their export values tell them apart.
                label:
                  field.type === 'radio' && field.props?.exportValue
                    ? `${field.name}: ${field.props.exportValue}`
                    : field.name,
                hint: fieldTypeLabel(field.type),
                glyph: 'Pencil',
                permission: 'edit',
                onSelect: () => pageDialog(() => fieldPropertiesDialog(field))(),
              })),
            },
          ];
        },
      },
      {
        id: 'certificate',
        label: '使用数字证书',
        group: 'Forms & Signatures',
        keywords: 'digital signature certify validate sign certificate pfx p12 id',
        description:
          '使用数字 ID 签名或验证，并检查 PDF 中的已有签名。',
        sections: () => [
          {
            title: 'Sign',
            items: [
              {
                label: '数字签名',
                icon: 'certificate',
                pressed: toolPressed('certsign'),
                permission: 'fill',
                hint: '拖动框选签名区域',
                disabled: noDocument(),
                onSelect: () => pageAction(() => setTool('certsign'))(),
              },
              {
                label: '认证文档（不可见签名）',
                icon: 'signatures',
                permission: 'fill',
                disabled: noDocument(),
                onSelect: () => safe(() => signWithCertificate({ certify: true }))(),
              },
            ],
          },
          {
            title: '检查',
            items: [
              {
                label: '验证所有签名',
                glyph: 'RefreshCw',
                disabled: noDocument(),
                onSelect: () =>
                  safe(async () => {
                    await validateSignatures(true);
                    if (signatureReports.length) {
                      showSidebarTab('signatures');
                      if (editorRoot.classList.contains('hide-pages')) await toggleSidebar(true);
                    }
                  })(),
              },
            ],
          },
        ],
      },
      {
        id: 'ocr',
        label: '扫描与 OCR',
        group: '扫描与 OCR',
        featured: true,
        permission: 'edit',
        keywords: 'ocr recognize text scanned searchable',
        description: '通过识别扫描页面上的文本，使其可被搜索和选中。',
        sections: () => [
          {
            title: '识别文本',
            items: [
              {
                label: '在此文件中…',
                icon: 'ocr',
                permission: 'edit',
                disabled: noDocument(),
                onSelect: () => pageDialog(ocrDialog)(),
              },
              {
                label: '清除已识别的文本',
                glyph: 'Trash2',
                permission: 'edit',
                disabled: noDocument(),
                onSelect: () => safe(removeRecognizedText)(),
              },
            ],
          },
          {
            title: '从扫描件创建',
            items: [
              {
                label: '图片转 PDF…',
                glyph: 'Images',
                onSelect: () => onOpen(),
              },
            ],
          },
        ],
      },
      {
        id: 'protect',
        label: '保护 PDF',
        group: '保护与标准化',
        featured: true,
        description: '设置打开 PDF 所需的密码，或限制其他人对其执行的操作。',
        sections: () => [
          {
            title: '密码',
            items: [
              {
                label: protection ? '修改密码…' : '设置密码保护…',
                icon: 'protect',
                disabled: busy,
                onSelect: () => safe(securityDialog)(),
              },
              protection && {
                label: '移除密码',
                glyph: 'LockOpen',
                disabled: busy,
                onSelect: () =>
                  safe(async () => {
                    if (access().owner || (await unlockOwner())) await setProtection(null);
                  })(),
              },
            ],
          },
        ],
      },
      {
        id: 'redact',
        label: '涂黑密文',
        group: 'Protect & Standardize',
        featured: true,
        permission: 'edit',
        keywords: 'redaction black out remove sensitive sanitize hidden information',
        description:
          '标记文本、图片或区域，然后应用涂黑以从文件中永久删除。',
        enter: () => refreshRedactionMarks().catch(() => {}),
        leave: () => {
          if (markupKind.value !== 'redact') return;
          markupKind.value = 'highlight';
          toolColors.highlight = MARKUP_COLORS.highlight;
          labelMarkupButton();
          if (tool === 'highlight') safe(() => setTool('select'))();
        },
        sections: () => [
          {
            title: '标记涂黑',
            items: [
              {
                label: '涂黑文本和图片',
                icon: 'redact',
                pressed: redacting(),
                hint: '选择文本，或选择区域并拖动',
                permission: 'edit',
                disabled: noDocument(),
                onSelect: () => safe(() => setMarkup('redact'))(),
              },
              {
                label: '查找文本并涂黑…',
                glyph: 'find',
                permission: 'edit',
                disabled: noDocument(),
                onSelect: () => pageDialog(findRedactDialog)(),
              },
              {
                label: '涂黑页面…',
                glyph: 'Files',
                permission: 'edit',
                disabled: noDocument(),
                onSelect: () => pageDialog(redactPagesDialog)(),
              },
              {
                label: '涂黑属性…',
                glyph: 'Settings2',
                onSelect: () => redactionPropertiesDialog(),
              },
            ],
          },
          {
            title: redactionMarks.length
              ? `${redactionMarks.length} 个待应用的标记`
              : '暂无标记',
            items: redactionMarks.slice(0, 50).map((mark) => ({
              // Several marks on one page are numbered, so each has a name of its own.
              label: `删除第 ${mark.page + 1} 页上的标记${markNumber(mark)}${mark.overlayText ? ` (${mark.overlayText})` : ''}`,
              glyph: 'X',
              permission: 'edit',
              disabled: busy,
              onSelect: () =>
                safe(() =>
                  mutate(
                    async (doc) =>
                      (await loadRedaction()).removeRedactionMark(doc, mark.page, mark.id),
                    '涂黑标记已删除。',
                  ),
                )(),
            })),
          },
          {
            title: '应用',
            items: [
              {
                label: '应用涂黑…',
                icon: 'redact',
                permission: 'edit',
                disabled: noDocument() || !redactionMarks.length,
                onSelect: () => pageDialog(applyRedactionsDialog)(),
              },
              {
                label: '删除隐藏信息…',
                glyph: 'sanitize',
                permission: 'edit',
                disabled: noDocument(),
                onSelect: () => pageDialog(sanitizeDialog)(),
              },
            ],
          },
        ],
      },
      {
        id: 'compress',
        label: '压缩 PDF',
        group: 'Protect & Standardize',
        featured: true,
        permission: 'edit',
        description: '通过缩小图片使文件体积更小。',
        run: () => pageDialog(reduceSizeDialog)(),
      },
      {
        id: 'stamp',
        label: '印章',
        group: 'Review',
        permission: 'edit',
        run: () => safe(insertStamp)(),
      },
      {
        id: 'split',
        label: '拆分 PDF',
        group: 'Create & Edit',
        permission: 'copy',
        run: () => pageDialog(splitDialog)(),
      },
      {
        id: 'extract',
        label: '提取页面',
        group: 'Create & Edit',
        permission: 'copy',
        run: () => pageDialog(extractDialog)(),
      },
      {
        id: 'insert-pages',
        label: '插入页面',
        group: 'Create & Edit',
        permission: 'assemble',
        run: () => pageDialog((version) => mergeDialog(pageIndex, version))(),
      },
      {
        id: 'crop',
        label: '裁剪页面',
        group: 'Create & Edit',
        permission: 'edit',
        run: () => pageAction(() => setTool('crop'))(),
      },
      {
        id: 'header-footer',
        label: '添加页眉和页脚',
        group: 'Create & Edit',
        permission: 'edit',
        run: () => pageDialog(headerFooterDialog)(),
      },
      {
        id: 'watermark',
        label: '添加水印',
        group: 'Create & Edit',
        permission: 'edit',
        run: () => pageDialog(watermarkDialog)(),
      },
      {
        id: 'bates',
        label: '贝茨编号',
        group: 'Create & Edit',
        keywords: 'legal production stamp number',
        permission: 'edit',
        run: () => pageDialog((version) => headerFooterDialog(version, { bates: true }))(),
      },
      {
        id: 'page-numbers',
        label: '添加页码',
        group: 'Create & Edit',
        permission: 'edit',
        run: () => pageDialog(pageNumbersDialog)(),
      },
      {
        id: 'flatten',
        label: '拼合',
        group: '打印生产',
        permission: ['edit', 'annotate'],
        run: () => pageDialog(flattenDialog)(),
      },
      {
        id: 'accessibility',
        label: '辅助功能准备',
        group: 'Protect & Standardize',
        keywords: 'accessibility check tags alt text screen reader pdf/ua reading order',
        description:
          '检查 PDF 的辅助功能问题并进行修复：标签、标题、语言、替换文本等。',
        sections: () => [
          {
            title: 'Check',
            items: [
              {
                label: '辅助功能检查',
                icon: 'accessibility',
                disabled: noDocument(),
                onSelect: () => safe(() => runAccessibilityCheck())(),
              },
            ],
          },
          {
            title: '修复',
            items: [
              ['tags', '自动标记文档', '标记标题、段落、列表和图像'],
              ['title', '设置文档标题…'],
              ['language', '设置文档语言…'],
              ['alt-text', '添加替换文本…'],
              ['field-descriptions', '添加表单字段说明…'],
              ['tab-order', '设置 Tab 键顺序'],
              ['bookmarks', '从标题添加书签'],
            ].map(([fix, label, hint]) => ({
              label,
              hint,
              glyph: 'Check',
              permission: 'edit',
              disabled: noDocument(),
              onSelect: () => safe(() => fixAccessibility(fix))(),
            })),
          },
        ],
      },
      {
        id: 'standards',
        label: 'PDF 标准',
        group: 'Protect & Standardize',
        keywords: 'pdf/a archive preflight compliance iso 19005 standard',
        description: '根据 PDF/A 标准检查 PDF 以便长期存档，或进行转换。',
        sections: () => [
          {
            title: 'PDF/A',
            items: [
              {
                label: '检查合规性…',
                icon: 'standards',
                disabled: noDocument(),
                onSelect: () => pageDialog(() => pdfaDialog('check'))(),
              },
              {
                label: '另存为 PDF/A…',
                icon: 'standards',
                permission: 'edit',
                disabled: noDocument(),
                onSelect: () => pageDialog(() => pdfaDialog('convert'))(),
              },
            ],
          },
        ],
      },
      {
        id: 'measure',
        label: '测量',
        group: 'Review',
        keywords: 'distance perimeter area ruler scale length',
        permission: 'annotate',
        description: '按绘图比例测量距离、周长和面积。',
        sections: () => [
          {
            title: 'Measure',
            items: [
              ['distance', '距离'],
              ['perimeter', '周长'],
              ['area', '面积'],
            ].map(([mode, label]) => ({
              label,
              icon: `measure-${mode}`,
              pressed: tool === 'measure' && measureMode.value === mode,
              permission: 'annotate',
              disabled: noDocument(),
              onSelect: () =>
                safe(async () => {
                  measureMode.value = mode;
                  measurePath = [];
                  await setTool('measure');
                })(),
            })),
          },
        ],
      },
      {
        id: 'compare',
        label: '比较文件',
        group: 'Review',
        keywords: 'difference diff versions changes',
        description: '查找两个版本 PDF 之间的差异。',
        run: () => pageDialog(compareDialog)(),
      },
      {
        id: 'batch',
        label: '批量处理',
        group: '自定义',
        keywords: 'action wizard guided actions automate many files bulk',
        description: '同时对多个 PDF 应用相同的处理步骤。',
        run: () => pageDialog(batchDialog)(),
      },
      {
        id: 'print',
        label: '打印',
        group: '印刷制作',
        permission: 'print',
        run: () => pageDialog(printDialog)(),
      },
      {
        id: 'document-properties',
        label: '文档属性',
        group: 'Protect & Standardize',
        run: () => pageDialog(detailsDialog)(),
      },
    ];
  }
  // Menus are built as they open, so every disabled and checked state is current.
  function fileItems(folded) {
    const cloud = saving || busy;
    // When Puter opened the app (a desktop window, or a tab from the dashboard) the shortcuts
    // belong to the cloud, where its files are: Open browses Puter and Save As chooses a Puter
    // folder. Elsewhere they use this device.
    const desktop = P.launchedByPuter() && !!onOpenCloud;
    return [
      { label: '新建空白 PDF', icon: 'FilePlus2', onSelect: onNew },
      desktop
        ? { label: '从本地打开…', icon: 'FolderOpen', shortcut: 'Mod+O', onSelect: onOpenCloud }
        : { label: '打开…', icon: 'FolderOpen', shortcut: 'Mod+O', onSelect: onOpen },
      desktop
        ? { label: '从本地设备打开…', icon: 'FolderOpen', onSelect: onOpen }
        : onOpenCloud && { label: '从本地打开…', icon: 'FolderOpen', onSelect: onOpenCloud },
      { separator: true },
      {
        label: path ? '保存' : '保存到本地',
        icon: 'CloudUpload',
        shortcut: 'Mod+S',
        disabled: cloud,
        onSelect: safe(() => save()),
      },
      {
        label: '在本地保存副本',
        icon: 'Copy',
        disabled: cloud,
        onSelect: safe(() => save(true)),
      },
      {
        label: '另存为到其他文件夹…',
        icon: 'FolderInput',
        ...(desktop && { shortcut: 'Mod+Shift+S' }),
        disabled: cloud,
        onSelect: safe(saveAs),
      },
      {
        label: '下载',
        icon: 'Download',
        ...(!desktop && { shortcut: 'Mod+Shift+S' }),
        disabled: busy,
        onSelect: safe(downloadPdf),
      },
      {
        permission: 'print',
        label: '打印…',
        icon: 'Printer',
        shortcut: 'Mod+P',
        disabled: busy,
        onSelect: pageDialog(printDialog),
      },
      { separator: true },
      {
        label: '重命名…',
        icon: 'Pencil',
        disabled: busy || saving,
        onSelect: () => nameButton.click(),
      },
      {
        label: '文档属性…',
        icon: 'Info',
        disabled: busy,
        onSelect: pageDialog(detailsDialog),
      },
      {
        permission: 'edit',
        label: '压缩 PDF 大小…',
        icon: 'Shrink',
        disabled: busy,
        onSelect: pageDialog(reduceSizeDialog),
      },
      {
        permission: ['edit', 'annotate'],
        label: '拼合…',
        icon: 'Layers',
        disabled: busy,
        onSelect: pageDialog(flattenDialog),
      },
      {
        permission: 'copy',
        label: 'Split PDF…',
        icon: 'Scissors',
        disabled: busy || !pdf || pdf.numPages < 2,
        onSelect: pageDialog(splitDialog),
      },
      {
        permission: 'copy',
        label: '将页面下载为图片…',
        icon: 'ImageDown',
        disabled: busy || !pdf,
        onSelect: pageDialog(pageImagesDialog),
      },
      {
        label: protection ? 'Change password…' : 'Protect with password…',
        icon: 'Lock',
        disabled: busy,
        onSelect: safe(securityDialog),
      },
      protection && {
        label: '移除密码',
        icon: 'LockOpen',
        disabled: busy,
        onSelect: safe(async () => {
          if (access().owner || (await unlockOwner())) await setProtection(null);
        }),
      },
      { separator: true },
      ...(folded
        ? [
            { label: 'Edit', icon: 'Undo2', items: editItems() },
            { label: 'View', icon: 'ZoomIn', items: viewItems() },
            { label: 'Page', icon: 'FileText', items: pageItems() },
            { label: 'Insert', icon: 'Plus', items: insertItems() },
            { separator: true },
          ]
        : []),
      { label: '返回文档库', icon: 'ArrowLeft', onSelect: goHome },
    ];
  }
  function editItems() {
    return [
      {
        label: '撤销',
        icon: 'Undo2',
        shortcut: 'Mod+Z',
        disabled: stepOff(undoButton),
        onSelect: safe(() => history('undo')),
      },
      {
        label: '重做',
        icon: 'Redo2',
        shortcut: 'Mod+Shift+Z',
        disabled: stepOff(redoButton),
        onSelect: safe(() => history('redo')),
      },
      { separator: true },
      {
        label: '全选文本',
        icon: 'Type',
        shortcut: 'Mod+A',
        disabled: !pageReady || !textContainer.firstChild,
        onSelect: () => {
          selectPageText();
          workspace.focus({ preventScroll: true });
        },
      },
      { label: '在 PDF 中查找', icon: 'Search', shortcut: 'Mod+F', onSelect: openSearch },
      {
        label: '前往页面…',
        icon: 'Hash',
        shortcut: 'Mod+Alt+G',
        disabled: !pdf || pdf.numPages < 2 || busy,
        onSelect: safe(goToPage),
      },
      { separator: true },
      {
        permission: 'fill',
        label: '填写表单…',
        icon: 'ListChecks',
        disabled: busy,
        onSelect: safe(formDialog),
      },
    ];
  }
  function viewItems() {
    return [
      {
        label: '适应宽度',
        shortcut: 'Mod+2',
        checked: scaleMode === 'fit',
        onSelect: safe(() => setZoom('fit')),
      },
      {
        label: '适应页面',
        shortcut: 'Mod+0',
        checked: scaleMode === 'page',
        onSelect: safe(() => setZoom('page')),
      },
      {
        label: '实际大小',
        shortcut: 'Mod+1',
        checked: scaleMode === '1',
        onSelect: safe(() => setZoom('1')),
      },
      { separator: true },
      {
        label: '放大',
        icon: 'ZoomIn',
        shortcut: 'Mod+Plus',
        disabled: stepOff(zoomInButton),
        onSelect: safe(() => setZoom(zoomStep(1))),
      },
      {
        label: '缩小',
        icon: 'ZoomOut',
        shortcut: 'Mod+Minus',
        disabled: stepOff(zoomOutButton),
        onSelect: safe(() => setZoom(zoomStep(-1))),
      },
      { separator: true },
      {
        label: '页面显示',
        icon: 'Files',
        items: [
          ['continuous', '连续滚动'],
          ['single', '单页'],
          ['two-continuous', '双页连续滚动'],
          ['two', '双页'],
        ].map(([display, label]) => ({
          label,
          checked: pageDisplay() === display,
          onSelect: () => setPageDisplay(display),
        })),
      },
      { label: '朗读文本', icon: 'Volume2', items: readingItems() },
      {
        label: '阅读模式',
        icon: 'BookOpen',
        checked: editorRoot.classList.contains('read-mode'),
        onSelect: () => setReadMode(!editorRoot.classList.contains('read-mode')),
      },
      {
        label: '全屏模式',
        icon: 'Maximize',
        shortcut: 'Mod+L',
        disabled: !document.fullscreenEnabled,
        onSelect: () => toggleFullScreen(),
      },
      {
        label: '工具面板',
        checked: !editorRoot.classList.contains('hide-tools'),
        shortcut: 'Shift+F4',
        onSelect: () => toggleToolsPanel(),
      },
      { separator: true },
      {
        label: '页面面板',
        checked: !editorRoot.classList.contains('hide-pages') && sidebarTab === 'pages',
        onSelect: safe(async () => {
          const shown = !editorRoot.classList.contains('hide-pages');
          if (shown && sidebarTab === 'pages') return toggleSidebar(false);
          showSidebarTab('pages');
          if (!shown) await toggleSidebar(true);
        }),
      },
      {
        label: '大纲面板',
        checked: !editorRoot.classList.contains('hide-pages') && sidebarTab === 'outline',
        disabled: !outline.hasItems,
        onSelect: safe(async () => {
          const shown = !editorRoot.classList.contains('hide-pages');
          if (shown && sidebarTab === 'outline') return toggleSidebar(false);
          showSidebarTab('outline');
          if (!shown) await toggleSidebar(true);
        }),
      },
      {
        label: '批注面板',
        checked: !editorRoot.classList.contains('hide-pages') && sidebarTab === 'comments',
        onSelect: safe(async () => {
          const shown = !editorRoot.classList.contains('hide-pages');
          if (shown && sidebarTab === 'comments') return toggleSidebar(false);
          showSidebarTab('comments');
          if (!shown) await toggleSidebar(true);
        }),
      },
      {
        label: '深色页面背景',
        icon: 'Moon',
        checked: darkPages,
        onSelect: safe(() => setDarkPages(!darkPages)),
      },
      { separator: true },
      {
        label: '上一页',
        icon: 'ChevronLeft',
        shortcut: 'Alt+←',
        disabled: stepOff(prevButton),
        onSelect: () => navigateBy(-1),
      },
      {
        label: '下一页',
        icon: 'ChevronRight',
        shortcut: 'Alt+→',
        disabled: stepOff(nextButton),
        onSelect: () => navigateBy(1),
      },
      { separator: true },
      { label: '外观与设置…', icon: 'Settings2', onSelect: settings },
      shortcuts && { label: '键盘快捷键…', icon: 'Keyboard', onSelect: shortcuts },
    ];
  }
  /** The Page menu for the current page, or a thumbnail's menu for the page at `index`. */
  /**
   * Where the view lands once `count` pages have been inserted after `index`: on the first new
   * page when the insertion followed the page being read, else on the same page as before,
   * wherever the insertion moved it. A thumbnail's menu thereby edits its own page while the
   * reader stays put, as the other thumbnail actions do.
   */
  function afterInsert(index, count = 1) {
    if (index === pageIndex) pageIndex = index + 1;
    else if (index < pageIndex) pageIndex += count;
  }
  function pageItems(index = pageIndex) {
    const count = pdf?.numPages || 1;
    return [
      { header: `第 ${index + 1} 页，共 ${count} 页` },
      {
        permission: 'assemble',
        label: '顺时针旋转',
        icon: 'RotateCw',
        disabled: busy,
        onSelect: pageAction(() => mutate((doc) => rotatePage(doc, index), null, 'assemble')),
      },
      {
        permission: 'assemble',
        label: '逆时针旋转',
        icon: 'RotateCcw',
        disabled: busy,
        onSelect: pageAction(() => mutate((doc) => rotatePage(doc, index, -90), null, 'assemble')),
      },
      {
        label: '所有页面',
        icon: 'Files',
        items: [
          {
            permission: 'assemble',
            label: '所有页面顺时针旋转',
            icon: 'RotateCw',
            disabled: busy,
            onSelect: pageAction(() => mutate((doc) => rotateAllPages(doc), null, 'assemble')),
          },
          {
            permission: 'assemble',
            label: '所有页面逆时针旋转',
            icon: 'RotateCcw',
            disabled: busy,
            onSelect: pageAction(() => mutate((doc) => rotateAllPages(doc, -90), null, 'assemble')),
          },
        ],
      },
      { separator: true },
      {
        permission: 'assemble',
        label: '向前移动页面',
        icon: 'ArrowUp',
        disabled: busy || index === 0,
        onSelect: pageAction(() => movePageTo(index, index - 1)),
      },
      {
        permission: 'assemble',
        label: '向后移动页面',
        icon: 'ArrowDown',
        disabled: busy || index >= count - 1,
        onSelect: pageAction(() => movePageTo(index, index + 1)),
      },
      { separator: true },
      {
        permission: 'assemble',
        label: '为此页添加书签…',
        icon: 'Bookmark',
        disabled: busy,
        onSelect: pageDialog(async () => {
          const title = await promptText('添加书签', '书签名称', `Page ${index + 1}`);
          if (title == null || destroyed) return;
          let added = false;
          await mutate(
            (doc) => {
              addBookmark(doc, { title, pageIndex: index });
              added = true;
            },
            '书签已添加。可在“大纲”选项卡中找到。',
            'assemble',
          );
          if (!added || destroyed || editorRoot.classList.contains('hide-pages')) return;
          // The thumbnail whose menu added the bookmark goes with its panel; the Outline tab,
          // there now that the PDF has a bookmark, takes the focus instead of the page body.
          const fromThumbnail = thumbnails.contains(document.activeElement);
          showSidebarTab('outline');
          const tab = sidebarTabs.querySelector('[data-tab="outline"]');
          tab.hidden = false;
          if (fromThumbnail) tab.focus({ preventScroll: true });
        }),
      },
      { separator: true },
      {
        permission: 'edit',
        label: '裁剪页面…',
        icon: 'Crop',
        disabled: busy,
        onSelect: pageAction(async () => {
          // Cropping is drawn on the page, so the chosen page comes into view first.
          if (index !== pageIndex && !(await navigate(index))) return;
          await setTool('crop');
        }),
      },
      {
        permission: 'edit',
        label: '清除裁剪',
        icon: 'Expand',
        disabled: busy,
        onSelect: pageAction(async () => {
          // Stays null when the edit was declined (a signed PDF asks first).
          let changed = null;
          await mutate(
            (doc) => (changed = resetCrop(doc, [index])),
            '已恢复显示完整页面。',
          );
          if (changed === false && !destroyed) toast('此页面未被裁剪。');
        }),
      },
      { separator: true },
      {
        permission: 'assemble',
        label: '在后方插入空白页',
        icon: 'FilePlus2',
        disabled: busy,
        onSelect: pageAction(() =>
          mutate(
            (doc) => {
              insertBlankPage(doc, index);
              afterInsert(index);
            },
            null,
            'assemble',
          ),
        ),
      },
      {
        permission: 'assemble',
        label: '复制页面',
        icon: 'Copy',
        disabled: busy,
        onSelect: pageAction(() =>
          mutate(
            async (doc) => {
              await duplicatePage(doc, index);
              afterInsert(index);
            },
            '页面已复制。',
            'assemble',
          ),
        ),
      },
      {
        permission: 'assemble',
        label: '插入图片作为页面…',
        icon: 'Images',
        disabled: busy,
        onSelect: pageAction(() => insertPicturePages(index)),
      },
      {
        permission: 'assemble',
        label: '从 PDF 插入页面…',
        icon: 'FileInput',
        disabled: busy,
        onSelect: pageDialog((version) => mergeDialog(index, version)),
      },
      index === pageIndex
        ? {
            permission: 'copy',
            label: '提取页面…',
            icon: 'FileOutput',
            disabled: busy,
            onSelect: pageDialog(extractDialog),
          }
        : {
            permission: 'copy',
            label: '提取此页',
            icon: 'FileOutput',
            disabled: busy,
            onSelect: pageAction(async () => {
              if (destroyed) return;
              const savedProtection = protection;
              const extracted = await extractPages(session.bytes, [index]);
              if (destroyed) return;
              const bytes = await exportBytes(extracted, savedProtection);
              if (destroyed) return;
              download(bytes, exportName(` page ${index + 1}`));
              toast(`Page ${index + 1} downloaded as a new PDF.`);
            }),
          },
      {
        permission: 'copy',
        label: '将此页下载为图片',
        icon: 'ImageDown',
        disabled: busy,
        onSelect: pageAction(() => downloadPageImage(index)),
      },
      { separator: true },
      {
        permission: 'assemble',
        label: '删除页面',
        icon: 'Trash2',
        danger: true,
        disabled: busy || count === 1,
        onSelect: pageDialog(() => deletePageAt(index)),
      },
    ];
  }
  function insertItems() {
    return [
      {
        permission: 'edit',
        label: '文本',
        icon: 'Type',
        hint: '然后单击放置文本的页面',
        onSelect: safe(() => setTool('text')),
      },
      { permission: 'edit', label: '图片…', icon: 'Image', disabled: busy, onSelect: insertImage },
      {
        permission: 'edit',
        label: '签名…',
        icon: 'Signature',
        disabled: busy,
        onSelect: safe(insertSignature),
      },
      {
        permission: 'edit',
        label: '印章…',
        icon: 'Stamp',
        disabled: busy,
        onSelect: safe(insertStamp),
      },
      {
        permission: 'annotate',
        label: '链接…',
        icon: 'Link',
        disabled: busy || !pdf,
        onSelect: pageAction(() => setTool('link')),
      },
      {
        permission: 'edit',
        label: 'Watermark…',
        icon: 'Droplets',
        disabled: busy || !pdf,
        onSelect: pageDialog(watermarkDialog),
      },
      {
        permission: 'edit',
        label: '页码…',
        icon: 'Hash',
        disabled: busy || !pdf,
        onSelect: pageDialog(pageNumbersDialog),
      },
      {
        permission: 'edit',
        label: '页眉和页脚…',
        icon: 'PanelTopBottomDashed',
        disabled: busy || !pdf,
        onSelect: pageDialog(headerFooterDialog),
      },
      { separator: true },
      {
        permission: 'annotate',
        label: '便签',
        icon: 'StickyNote',
        onSelect: safe(() => setTool('note')),
      },
      {
        permission: 'annotate',
        label: '高亮',
        icon: 'Highlighter',
        onSelect: safe(() => setTool('highlight')),
      },
      {
        permission: 'edit',
        label: '手绘',
        icon: 'Pencil',
        onSelect: safe(() => setTool('ink')),
      },
      {
        permission: 'edit',
        label: '形状',
        icon: 'Square',
        onSelect: safe(() => setTool('shape')),
      },
    ];
  }
  function openFileMenu(anchor, folded = false) {
    openMenu({
      anchor,
      items: fileItems(folded),
      align: folded ? 'end' : 'start',
      label: '文件',
      minWidth: 250,
    });
  }
  function openEditMenu(anchor) {
    openMenu({ anchor, items: editItems(), label: '编辑', minWidth: 230 });
  }
  function openViewMenu(anchor) {
    openMenu({ anchor, items: viewItems(), label: '视图', minWidth: 230 });
  }
  function openPageMenu(anchor) {
    openMenu({ anchor, items: pageItems(), label: '页面', minWidth: 240 });
  }
  function openInsertMenu(anchor) {
    openMenu({ anchor, items: insertItems(), label: '插入', minWidth: 230 });
  }
  /** Move a page; the page being viewed stays in view, wherever it lands in the new order. */
  function movePageTo(from, to) {
    if (!pdf || from === to || to < 0 || to >= pdf.numPages) return;
    const current = pageIndex;
    return mutate(
      (doc) => {
        movePage(doc, from, to);
        movedThumbnail = { from, to };
        pageIndex =
          from === current
            ? to
            : from < current && to >= current
              ? current - 1
              : from > current && to <= current
                ? current + 1
                : current;
      },
      null,
      'assemble',
    ).finally(() => (movedThumbnail = null));
  }
  /**
   * Sign with a certificate: choose a digital ID, then append a signature to the PDF as it is
   * now. A rectangle gives a visible signature on that page; none gives an invisible one.
   */
  /**
   * The page's unsigned, visible signature field under `point` (PDF user space), or with no
   * point its first one; null when there is none.
   */
  async function emptySignatureField(page, point = null) {
    const { listSignatureFields } = await import('./core/digital-signature.js');
    const fields = (await listSignatureFields(session.bytes)).filter(
      (field) => !field.signed && !field.invisible && field.page === page,
    );
    if (!point) return fields[0] ?? null;
    return (
      fields.find(
        ({ rect: [x0, y0, x1, y1] }) =>
          point.x >= x0 && point.x <= x1 && point.y >= y0 && point.y <= y1,
      ) ?? null
    );
  }
  async function signWithCertificate({
    rect = null,
    page = pageIndex,
    certify = false,
    fieldName,
  } = {}) {
    requireAccess('fill');
    if (protection)
      throw new Error(
        '使用证书签名前请先移除密码。再次加密文件会使签名失效。',
      );
    await finishDrafts();
    const chosen = await chooseDigitalId(digitalIds, dialogOptions);
    if (!chosen || destroyed) return;
    if (!digitalIds.includes(chosen)) digitalIds.unshift(chosen);
    const details = await signatureDetailsDialog(chosen.summary, { certify, ...dialogOptions });
    if (!details || destroyed || busy) return;
    const { signPdf } = await import('./core/digital-signature.js');
    busy = true;
    activity = certify ? 'Certifying…' : 'Signing…';
    updateStatus();
    try {
      const signed = await signPdf(session.bytes, chosen.identity, {
        page,
        rect,
        fieldName,
        reason: details.reason,
        location: details.location,
        contactInfo: details.contactInfo,
        certify: details.certify,
      });
      if (destroyed) return;
      session.adopt(signed);
      signedEditAccepted = false;
      if (tool === 'certsign') tool = 'select';
      await reload();
    } finally {
      busy = false;
      activity = null;
      if (!destroyed) updateStatus();
    }
    if (destroyed) return;
    await setTool('select');
    toast(
      certify
        ? '已认证。请下载或保存 PDF 以保留认证。'
        : '已签名。请下载或保存 PDF 以保留签名。',
    );
  }
  /** Delete several pages at once, after one confirmation. */
  async function deletePages(indices) {
    requireAccess('assemble');
    const list = [...new Set(indices)].sort((a, b) => b - a);
    if (!list.length) return false;
    if (list.length >= pdf.numPages) {
      toast('PDF 中至少需要保留一页。', { error: true });
      return false;
    }
    if (list.length === 1) return deletePageAt(list[0]);
    if (
      !(await confirmAction(
        `删除 ${list.length} 个页面？`,
        `确定要删除页面 ${formatPageRange([...list].reverse())} 吗？指向它们的书签和链接将重定向到相邻页面。在 PDF 保持打开期间可以撤销此操作。`,
        '删除页面',
      ))
    )
      return false;
    await mutate(
      (doc) => {
        deleteDocumentPages(doc, list);
        for (const index of list) if (index < pageIndex) pageIndex--;
        pageIndex = Math.min(pageIndex, doc.getPageCount() - 1);
      },
      `${list.length} pages deleted.`,
      'assemble',
    );
  }
  /** Move a set of pages, in their order, so the first lands at `to` among the others. */
  function movePages(indices, to) {
    const moving = [...new Set(indices)].sort((a, b) => a - b);
    const count = pdf.numPages;
    const rest = [...Array(count).keys()].filter((i) => !moving.includes(i));
    const order = [...rest.slice(0, to), ...moving, ...rest.slice(to)];
    return reorderTo(order, moving.length);
  }
  /** Put the pages in `order`, having moved `moved` of them. */
  function reorderTo(order, moved) {
    if (order.every((i, k) => i === k)) return;
    return mutate(
      (doc) => {
        reorderPages(doc, order);
        pageIndex = order.indexOf(pageIndex);
      },
      moved === 1 ? '页面已移动。' : `${moved} pages moved.`,
      'assemble',
    );
  }
  /** Download chosen pages as a new PDF. */
  async function extractToDownload(indices) {
    requireAccess('copy');
    const list = [...new Set(indices)].sort((a, b) => a - b);
    const savedProtection = protection;
    const extracted = await extractPages(session.bytes, list);
    if (destroyed) return;
    const bytes = await exportBytes(extracted, savedProtection);
    if (destroyed) return;
    const { file, message } = extractedPages(list);
    download(bytes, file);
    toast(message);
  }
  /**
   * The file name and message for downloaded pages: their numbers, or their count when the
   * numbers of scattered pages would not fit a file name.
   */
  function extractedPages(indices) {
    const label = formatPageRange(indices);
    const suffix = indices.length === 1 ? ` page ${label}` : ` pages ${label}`;
    const short = suffix.length <= 64;
    return {
      file: exportName(short ? suffix : ` ${indices.length} pages`),
      message: `${short ? `${indices.length === 1 ? 'Page' : 'Pages'} ${label}` : `${indices.length} pages`} downloaded as a new PDF.`,
    };
  }
  async function deletePageAt(index) {
    requireAccess('assemble');
    // A declined deletion says so, as deletePages does, so Organize pages keeps its choice.
    if (
      !(await confirmAction(
        'Delete this page?',
        `Remove page ${index + 1}? Bookmarks and links to it will go to the ${index + 1 < pdf.numPages ? 'next' : 'previous'} page. You can undo this while the PDF is open.`,
        '删除页面',
      ))
    )
      return false;
    await mutate(
      (doc) => {
        deletePage(doc, index);
        if (index < pageIndex) pageIndex--;
      },
      null,
      'assemble',
    );
  }
  /** Add a page per chosen picture after the given page, each fitted to a sheet of paper. */
  function insertPicturePages(after = pageIndex) {
    requireAccess('assemble');
    const input = el('input', { type: 'file', accept: 'image/png,image/jpeg', multiple: true });
    input.onchange = safe(async () => {
      const files = [...input.files];
      if (!files.length) return;
      await mutate(
        async (doc) => {
          const images = await normalizeImageFiles(files, {
            maxPages: MAX_PAGES - doc.getPageCount(),
            lazy: true,
            signal: dialogController.signal,
          });
          await addImagePages(doc, images, {
            after,
            paper: defaultPaper(),
            signal: dialogController.signal,
          });
          afterInsert(after, images.length);
        },
        files.length === 1
          ? '已将图片添加为页面。'
          : `${files.length} pictures added as pages.`,
        'assemble',
        { signal: dialogController.signal },
      );
    });
    input.click();
  }
  /* ---------- Redaction ---------- */
  /** Find words or patterns on every page and mark the chosen matches for redaction. */
  async function findRedactDialog() {
    requireAccess('edit');
    const { REDACTION_PATTERNS, findTextRects, addRedactionMarks } = await loadRedaction();
    const query = el('input', { class: 'input', autocomplete: 'off', maxlength: 200 });
    const whole = el('input', { type: 'checkbox', id: 'redact-whole' });
    const patternBoxes = Object.entries(REDACTION_PATTERNS).map(([key, pattern]) => ({
      key,
      box: el('input', { type: 'checkbox', id: `redact-pattern-${key}` }),
      label: pattern.label,
    }));
    const results = el('ul', { class: 'redact-results', 'aria-label': 'Matches' });
    const status = el('p', { class: 'muted', role: 'status' });
    let found = [];
    const search = safe(async () => {
      // Enter submits the form even while the Search button is disabled; a second search
      // would add its matches to the first one's list.
      if (searchButton.disabled) return;
      const text = query.value.trim();
      const patterns = patternBoxes.filter((entry) => entry.box.checked);
      if (!text && !patterns.length) throw new Error('请输入要查找的文本或选择一种模式。');
      searchButton.disabled = true;
      status.textContent = 'Searching…';
      try {
        const doc = await PDFDocument.load(session.bytes, { updateMetadata: false });
        found = [];
        // Pages whose fonts do not say which characters they draw: their text cannot be found.
        const unsearchable = [];
        for (let page = 0; page < doc.getPageCount(); page++) {
          if (!d.open) return;
          const queries = [
            ...(text ? [text] : []),
            ...patterns.map((entry) => REDACTION_PATTERNS[entry.key]),
          ];
          const report = {};
          // Text found by both the typed words and a pattern (or two patterns) is listed once.
          const seen = new Set();
          // Every search of the page reads its glyphs once.
          const cache = new Map();
          for (const q of queries)
            for (const match of await findTextRects(doc, page, q, {
              wholeWord: whole.checked,
              report,
              cache,
            })) {
              const key = JSON.stringify(match.rects);
              if (seen.has(key)) continue;
              seen.add(key);
              found.push({ page, ...match });
            }
          if (report.unsearchable) unsearchable.push(page);
        }
        status.textContent = [
          found.length
            ? `${found.length} ${found.length === 1 ? 'match' : 'matches'} found. Choose the ones to mark.`
            : '未找到匹配项。',
          unsearchable.length &&
            `Some text on ${unsearchable.length === 1 ? 'page' : 'pages'} ${formatPageRange(unsearchable)} cannot be searched. Check it by eye.`,
        ]
          .filter(Boolean)
          .join(' ');
        results.replaceChildren(
          ...found.map((match, i) =>
            el(
              'li',
              {},
              el(
                'label',
                { class: 'result-row' },
                el('input', { type: 'checkbox', checked: true, 'data-index': i }),
                el('span', {}, `Page ${match.page + 1}: ${match.text}`),
              ),
            ),
          ),
        );
        markButton.disabled = !found.length;
      } finally {
        searchButton.disabled = false;
      }
    });
    const mark = safe(async () => {
      const chosen = [...results.querySelectorAll('input:checked')].map(
        (box) => found[Number(box.dataset.index)],
      );
      if (!chosen.length) throw new Error('请至少选择一个要标记的匹配项。');
      await mutateDialog(
        d,
        (doc) => {
          const byPage = new Map();
          for (const match of chosen)
            byPage.set(match.page, [...(byPage.get(match.page) || []), ...match.rects]);
          for (const [page, rects] of byPage) addRedactionMarks(doc, page, rects, redactionStyle);
        },
        `${chosen.length} ${chosen.length === 1 ? 'match' : 'matches'} marked for redaction. Choose Apply redactions to remove them.`,
      );
    });
    const form = el(
      'form',
      { class: 'stack' },
      labeled('redact-query', '查找文本', query),
      el(
        'label',
        { class: 'checkbox-row', for: 'redact-whole' },
        el('span', {}, '仅匹配整个单词'),
        whole,
      ),
      el('p', { class: 'muted' }, '或查找模式'),
      el(
        'div',
        { class: 'redact-patterns' },
        ...patternBoxes.map((entry) =>
          el(
            'label',
            { class: 'checkbox-row', for: entry.box.id },
            el('span', {}, entry.label),
            entry.box,
          ),
        ),
      ),
      status,
      results,
    );
    form.onsubmit = (e) => {
      e.preventDefault();
      search();
    };
    const searchButton = button('搜索', 'Search', search, 'btn');
    const markButton = button('标记选中项', null, mark, 'btn primary', { disabled: true });
    const d = modal('查找文本并密文处理', form, [
      button('取消', null, () => d.close()),
      searchButton,
      markButton,
    ]);
    query.focus();
  }
  /** What applied redactions look like: the fill color and optional overlay text. */
  function redactionPropertiesDialog() {
    const fill = el('input', { type: 'color', value: redactionStyle.fill });
    const overlay = el('input', {
      class: 'input',
      maxlength: 100,
      value: redactionStyle.overlayText,
      placeholder: '例如：机密',
    });
    const repeat = el('input', {
      type: 'checkbox',
      id: 'redact-repeat',
      checked: redactionStyle.repeat,
    });
    const save = safe(async () => {
      // Applied marks draw overlay text in Helvetica; other characters would be left out.
      const missing = (await loadRedaction()).overlayTextUnsupported(overlay.value);
      if (missing.length) {
        overlay.focus();
        throw new Error(
          `覆盖文本无法显示 ${missing.slice(0, 5).join(' ')}。请使用拉丁字母、数字和标点符号。`,
        );
      }
      redactionStyle.fill = fill.value;
      redactionStyle.overlayText = overlay.value;
      redactionStyle.repeat = repeat.checked;
      d.close();
      toast('新的密文标记将使用这些设置。');
    });
    const form = el(
      'form',
      { class: 'stack' },
      labeled('redact-fill', '填充颜色', fill),
      labeled('redact-overlay', '覆盖文本', overlay),
      el(
        'label',
        { class: 'checkbox-row', for: 'redact-repeat' },
        el('span', {}, '重复覆盖文本以填满区域'),
        repeat,
      ),
    );
    form.onsubmit = (e) => {
      e.preventDefault();
      save();
    };
    const d = modal('密文属性', form, [
      button('取消', null, () => d.close()),
      button('保存', null, save, 'btn primary'),
    ]);
  }
  /** Mark whole pages for redaction. */
  async function redactPagesDialog() {
    requireAccess('edit');
    const { addRedactionMarks } = await loadRedaction();
    const choices = pageChoices('redact-pages', pdf.numPages);
    const apply = safe(async () => {
      const indices = choices.indices();
      await mutateDialog(
        d,
        (doc) => {
          for (const index of indices) {
            const page = doc.getPage(index);
            // The whole page, including what its crop box hides but the file still holds.
            // A box may list its corners either way round ([612 792 0 0]).
            const boxes = [page.getMediaBox(), page.getCropBox()];
            const xs = boxes.flatMap((box) => [box.x, box.x + box.width]),
              ys = boxes.flatMap((box) => [box.y, box.y + box.height]);
            const area = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
            addRedactionMarks(doc, index, [area], redactionStyle);
          }
        },
        `${indices.length === 1 ? '该页面已' : `${indices.length} 个页面已`}标记为密文。`,
      );
    });
    const d = modal('密文处理页面', el('div', { class: 'stack' }, choices.list), [
      button('取消', null, () => d.close()),
      button('标记页面', null, apply, 'btn primary'),
    ]);
  }
  /** Apply every mark: what lies under it is removed from the file, then it is filled. */
  async function applyRedactionsDialog() {
    requireAccess('edit');
    const { applyRedactions } = await loadRedaction();
    const { sanitizeDocument, SANITIZE_DEFAULTS } = await loadSanitize();
    const sanitize = el('input', { type: 'checkbox', id: 'redact-sanitize', checked: true });
    const apply = safe(async () => {
      let report = null,
        sanitized = null;
      const committed = await mutateDialog(
        d,
        async (doc) => {
          report = await applyRedactions(doc, { codec: createImageCodec(loadPdf) });
          if (report === false) throw new Error('没有可应用的密文标记。');
          if (sanitize.checked)
            sanitized = await sanitizeDocument(doc, {
              ...SANITIZE_DEFAULTS,
              comments: false,
              formFields: false,
            });
        },
        null,
      );
      if (!committed || !report || destroyed) return;
      const count = (n, word) => n && `${n} ${word}${n === 1 ? '' : 's'}`;
      const removed = [
        count(report.text, 'character'),
        count(report.images.removed, 'image'),
        count(report.paths, 'drawing'),
        count(report.annotations, 'annotation'),
      ].filter(Boolean);
      // A picture under part of a mark keeps the rest: it was not removed.
      const done = [
        removed.length && `removed ${removed.join(', ')}`,
        report.images.redacted &&
          `erased the marked part of ${count(report.images.redacted, 'image')}`,
      ].filter(Boolean);
      const summary = `密文已应用${done.length ? `：${done.join('；')}` : ''}。保存或下载以保留密文处理后的文件。`;
      const warnings = [...new Set([...report.warnings, ...(sanitized?.warnings || [])])];
      if (!warnings.length) return toast(summary);
      // What could not be handled as usual must not pass by in a brief message: someone could
      // share the file believing everything under the marks is gone.
      const notice = modal(
        '检查密文处理后的 PDF',
        el(
          'div',
          { class: 'stack' },
          el('p', {}, summary),
          el('p', {}, '部分操作未完全按预期完成。在分享文件之前请检查以下内容：'),
          el('ul', {}, ...warnings.map((warning) => el('li', {}, warning))),
        ),
        [button('确定', null, () => notice.close(), 'btn primary')],
      );
    });
    const d = modal(
      '应用密文',
      el(
        'div',
        { class: 'stack' },
        el(
          'p',
          {},
          `${redactionMarks.length ? `将应用 ${redactionMarks.length} 个标记。` : ''}每个标记下方的文本、图片、绘图、链接和批注都将从 PDF 中彻底移除，而不仅仅是遮盖。如果标记覆盖了表单字段，该字段在所有位置都会被移除。`,
        ),
        el(
          'label',
          { class: 'checkbox-row', for: 'redact-sanitize' },
          el(
            'span',
            {},
            // Everything it takes, links and recognized text above all, which readers miss.
            '同时移除隐藏信息（元数据、脚本、附件、外部网站和文件链接、隐藏文本（包括 OCR 识别文本）以及隐藏图层）',
          ),
          sanitize,
        ),
        el(
          'p',
          { class: 'muted' },
          '在 PDF 保持打开期间可以撤销此操作。一旦保存，移除的内容将无法恢复。',
        ),
      ),
      [button('取消', null, () => d.close()), button('应用', null, apply, 'btn primary')],
    );
  }
  /** Remove hidden information, choosing which kinds. */
  async function sanitizeDialog() {
    requireAccess('edit');
    const { sanitizeDocument, sanitizedCount, SANITIZE_DEFAULTS } = await loadSanitize();
    const LABELS = {
      metadata: '元数据（作者、标题、XMP 以及照片中的相机、时间和位置信息）',
      privateData: '其他应用程序的私有数据',
      javascript: '脚本',
      actions: '打开其他文件或网站的链接和操作',
      attachments: '文件附件',
      thumbnails: '嵌入的页面缩略图',
      searchIndex: '嵌入的搜索索引',
      webCapture: '网页抓取信息',
      hiddenText: '隐藏文本（包括 OCR 文本图层）',
      comments: '批注和标记',
      formFields: '表单字段',
      hiddenLayers: '隐藏图层',
      alternateImages: '替代图片',
      unusedContent: '页面未使用的图片和绘图',
      bookmarks: '书签',
    };
    const boxes = Object.entries(LABELS).map(([key, label]) => ({
      key,
      label,
      box: el('input', {
        type: 'checkbox',
        id: `sanitize-${key}`,
        checked: SANITIZE_DEFAULTS[key],
      }),
    }));
    const apply = safe(async () => {
      if (!boxes.some((entry) => entry.box.checked))
        throw new Error('请至少选择一种要移除的信息类型。');
      const options = Object.fromEntries(boxes.map((entry) => [entry.key, entry.box.checked]));
      let report = null;
      const committed = await mutateDialog(
        d,
        async (doc) => {
          report = await sanitizeDocument(doc, options);
          // Nothing found leaves the file as it was: no undo step, no unsaved changes.
          if (!sanitizedCount(report)) return false;
        },
        null,
      );
      if (!report || destroyed || (!committed && sanitizedCount(report))) return;
      const summary = committed
        ? '隐藏信息已移除。保存或下载以保留清理后的文件。'
        : '未发现所选类型的隐藏信息。';
      if (!report.warnings.length) return toast(summary);
      // Content that could not be examined may still hide what was asked to go.
      const notice = modal(
        '检查清理后的 PDF',
        el(
          'div',
          { class: 'stack' },
          el('p', {}, summary),
          el('p', {}, '部分内容无法检查。在分享文件之前请检查以下内容：'),
          el('ul', {}, ...[...new Set(report.warnings)].map((warning) => el('li', {}, warning))),
        ),
        [button('确定', null, () => notice.close(), 'btn primary')],
      );
    });
    const d = modal(
      '移除隐藏信息',
      el(
        'div',
        { class: 'stack' },
        el('p', { class: 'muted' }, '选择要从 PDF 中移除的内容。'),
        ...boxes.map((entry) =>
          el(
            'label',
            { class: 'checkbox-row', for: entry.box.id },
            el('span', {}, entry.label),
            entry.box,
          ),
        ),
      ),
      [button('取消', null, () => d.close()), button('移除', null, apply, 'btn primary')],
    );
  }
  /**
   * Combine files: PDFs and pictures, in an order the person sets, become one new PDF that
   * opens in place of this one (which can come first). Protected PDFs ask for their password.
   */
  function combineDialog() {
    const entries = [];
    const includeCurrent = el('input', {
      type: 'checkbox',
      id: 'combine-current',
      checked: !untouchedBlank(),
    });
    const list = el('ol', { class: 'combine-list', 'aria-label': '要合并的文件' });
    const empty = el('p', { class: 'muted' }, '添加 PDF 或图片以进行合并。');
    // Rows are drawn again after each change; `focus` names the row and button ([up, down,
    // remove]) that takes the keyboard focus, so it is not lost with the pressed button.
    const render = (focus) => {
      empty.hidden = entries.length > 0;
      list.replaceChildren(
        ...entries.map((entry, i) =>
          el(
            'li',
            { class: 'combine-row' },
            el('span', { class: 'combine-name', title: entry.name }, entry.name),
            el(
              'span',
              { class: 'muted combine-kind' },
              entry.kind === 'pdf'
                ? `${entry.pages} 页`
                : '图片',
            ),
            iconButton(`上移 ${entry.name}`, 'ArrowUp', () => move(i, -1), {
              disabled: i === 0,
            }),
            iconButton(`下移 ${entry.name}`, 'ArrowDown', () => move(i, 1), {
              disabled: i === entries.length - 1,
            }),
            iconButton(`移除 ${entry.name}`, 'Trash2', () => {
              entries.splice(i, 1);
              render({ row: Math.min(i, entries.length - 1), button: 2 });
            }),
          ),
        ),
      );
      if (!focus) return;
      const buttons = list.querySelectorAll('.combine-row')[focus.row]?.querySelectorAll('button');
      if (!buttons) return addButton.focus();
      // A move button that has reached the end of the list gives way to the other one.
      const target = buttons[focus.button];
      (target.disabled ? buttons[1 - focus.button] : target).focus();
    };
    const move = (i, step) => {
      const [entry] = entries.splice(i, 1);
      entries.splice(i + step, 0, entry);
      render({ row: i + step, button: step < 0 ? 0 : 1 });
    };
    const addFiles = safe(async () => {
      const input = el('input', {
        type: 'file',
        multiple: true,
        accept: '.pdf,application/pdf,image/png,image/jpeg',
      });
      input.onchange = safe(async () => {
        // A file that cannot be added stops the rest, but those already added are listed.
        try {
          for (const file of input.files) {
            if (!d.open) return;
            if (/^image\/(png|jpeg)$/.test(file.type)) {
              if (file.size > MAX_IMAGE_SIZE) throw new Error(`${file.name} is larger than 20 MB.`);
              entries.push({ kind: 'image', name: file.name, file });
              continue;
            }
            if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name} is larger than 100 MB.`);
            let bytes = new Uint8Array(await file.arrayBuffer());
            let source = await validatePdf(bytes).catch((error) => {
              if (error.code !== 'encrypted') throw error;
              return null;
            });
            if (!source) {
              const unlocked = await promptUnlock(bytes, file.name, dialogOptions);
              if (!unlocked || !d.open) continue;
              if (!documentAccess(unlocked.protection).copy) {
                const owner = await promptOwner(unlocked.protection, dialogOptions);
                if (!owner || !d.open) continue;
                requireDocumentAccess(owner, 'copy');
              }
              bytes = unlocked.bytes;
              source = await PDFDocument.load(bytes, { updateMetadata: false });
            }
            entries.push({ kind: 'pdf', name: file.name, bytes, pages: source.getPageCount() });
          }
        } finally {
          render();
        }
      });
      input.click();
    });
    const combine = safe(async () => {
      const parts = [
        ...(includeCurrent.checked
          ? [{ kind: 'pdf', name, bytes: session.bytes.slice(), current: true }]
          : []),
        ...entries,
      ];
      if (parts.length < 2) throw new Error('请至少选择两个要合并的文件。');
      if (parts[0]?.current) requireAccess('copy');
      combineButton.disabled = true;
      d.setAttribute('aria-busy', 'true');
      try {
        const doc = await PDFDocument.create();
        // The language screen readers read the text in, when every PDF combined names the same.
        const languages = new Set();
        const languageOf = (source) =>
          languages.add(source.catalog.lookup(PDFName.of('Lang'))?.decodeText?.() || null);
        for (const part of parts) {
          if (!d.open) return;
          if (part.kind === 'pdf') await insertPdfPages(doc, part.bytes, { onSource: languageOf });
          else {
            const images = await normalizeImageFiles([part.file], {
              maxPages: MAX_PAGES - doc.getPageCount(),
              lazy: true,
              signal: dialogController.signal,
            });
            await addImagePages(doc, images, { paper: defaultPaper() });
          }
        }
        const [language] = languages;
        if (languages.size === 1 && language)
          doc.catalog.set(PDFName.of('Lang'), PDFString.of(language));
        const bytes = await savePdf(doc);
        if (!d.open || destroyed) return;
        d.close();
        await onOpenBytes(bytes, '合并.pdf');
      } finally {
        combineButton.disabled = false;
        d.removeAttribute('aria-busy');
      }
    });
    const combineButton = button('合并', 'Files', combine, 'btn primary');
    const addButton = button('添加文件…', 'Plus', addFiles, 'btn');
    const d = modal(
      '合并文件',
      el(
        'div',
        { class: 'stack combine-dialog' },
        el(
          'label',
          { class: 'checkbox-row', for: 'combine-current' },
          el('span', {}, `以“${name}”开始`),
          includeCurrent,
        ),
        addButton,
        empty,
        list,
        el(
          'p',
          { class: 'muted' },
          '页面将按此顺序复制到一个新的 PDF 中。表单字段将被拼合以保持其内容可见。',
        ),
      ),
      [button('取消', null, () => d.close()), combineButton],
    );
    render();
  }
  /** Pick a PDF, then choose which of its pages go where; "after" offers the given page. */
  async function mergeDialog(after = pageIndex, version = beginDialogRequest()) {
    requireAccess('assemble');
    const isCurrent = () => !destroyed && version === dialogVersion();
    const passwordOptions = {
      ...dialogOptions,
      isCurrent,
      // The import's own password prompts advance the dialog generation too.
      onOpen: () => (version = dialogVersion()),
    };
    const input = el('input', { type: 'file', accept: '.pdf,application/pdf' });
    input.onchange = safe(async () => {
      const f = input.files[0];
      if (!f || !canOpenDialog(version)) return;
      try {
        if (f.size > MAX_FILE_SIZE) throw new Error('请选择小于 100 MB 的 PDF 文件。');
        let bytes = new Uint8Array(await f.arrayBuffer());
        if (!canOpenDialog(version)) return;
        let source = await validatePdf(bytes).catch((error) => {
          if (error.code !== 'encrypted') throw error;
          return null;
        });
        if (!canOpenDialog(version)) return;
        if (!source) {
          const unlocked = await promptUnlock(bytes, f.name, passwordOptions);
          if (!unlocked || !canOpenDialog(version)) return;
          if (!documentAccess(unlocked.protection).copy) {
            const owner = await promptOwner(unlocked.protection, passwordOptions);
            if (!owner || !canOpenDialog(version)) return;
            requireDocumentAccess(owner, 'copy');
          }
          bytes = unlocked.bytes;
          source = await PDFDocument.load(bytes, { updateMetadata: false });
        }
        if (!canOpenDialog(version)) return;
        await insertPagesDialog(bytes, f.name, source.getPageCount(), after);
      } catch (error) {
        if (isCurrent()) throw error;
      }
    });
    input.click();
  }
  function insertPagesDialog(bytes, sourceName, sourceCount, current = pageIndex) {
    const rangeInput = el('input', {
      type: 'text',
      class: 'input',
      placeholder: '例如：1-3, 5',
      'aria-label': '另一个 PDF 的页面',
      inputmode: 'numeric',
      autocomplete: 'off',
    });
    const choice = (group, value, label, checked) =>
      el(
        'label',
        { class: 'choice-row' },
        el('input', { type: 'radio', name: group, value, checked }),
        el('span', {}, label),
      );
    const rangeChoice = choice('insert-pages', 'range', '指定页面', false);
    rangeInput.addEventListener('input', () => {
      rangeChoice.querySelector('input').checked = true;
    });
    const pages = el(
      'div',
      { class: 'choice-list', role: 'radiogroup', 'aria-label': '要插入的页面' },
      choice('insert-pages', 'all', `所有页面 (${sourceCount})`, true),
      el('div', { class: 'choice-with-input' }, rangeChoice, rangeInput),
    );
    const where = el(
      'div',
      { class: 'choice-list', role: 'radiogroup', 'aria-label': '插入位置' },
      choice('insert-where', 'after', `第 ${current + 1} 页之后`, true),
      choice('insert-where', 'end', '文档末尾', false),
      choice('insert-where', 'start', '文档开头', false),
    );
    const form = el(
      'form',
      { class: 'stack' },
      el(
        'p',
        { class: 'muted' },
        `${sourceName} has ${sourceCount} ${sourceCount === 1 ? 'page' : 'pages'}. Filled forms in it become fixed page content.`,
      ),
      el('p', { class: 'muted' }, 'Pages'),
      pages,
      el('p', { class: 'muted' }, '放置它们'),
      where,
    );
    let inserting = false;
    const apply = safe(async () => {
      if (inserting || destroyed || !d.open) return;
      const indices =
        pages.querySelector('input:checked')?.value === 'range'
          ? parsePageRange(rangeInput.value, sourceCount)
          : Array.from({ length: sourceCount }, (_, i) => i);
      const placement = where.querySelector('input:checked')?.value;
      inserting = true;
      const controls = [insertButton, ...form.querySelectorAll('input')];
      controls.forEach((control) => (control.disabled = true));
      try {
        // Reading the chosen file can take long enough for more edits or history commands.
        // Preserve those changes before inserting pages replaces the rendered document.
        await idle();
        if (destroyed || !d.open) return;
        await finishDrafts();
        if (destroyed || !d.open) return;
        const after = placement === 'start' ? -1 : placement === 'end' ? pdf.numPages - 1 : current;
        d.close();
        await mutate(
          async (doc) => {
            const [first] = await insertPdfPages(doc, bytes, { pages: indices, after });
            // From the page being read the view moves to the new pages; from another page's
            // thumbnail it stays where it is.
            if (current === pageIndex) pageIndex = first;
            else if (after < pageIndex) pageIndex += indices.length;
          },
          `${indices.length === 1 ? '1 page' : `${indices.length} pages`} inserted ${
            placement === 'start'
              ? 'at the beginning'
              : placement === 'end'
                ? 'at the end'
                : `after page ${current + 1}`
          }.`,
          'assemble',
        );
      } finally {
        inserting = false;
        controls.forEach((control) => (control.disabled = false));
      }
    });
    form.onsubmit = (e) => {
      e.preventDefault();
      apply();
    };
    const insertButton = button('插入页面', 'Files', apply, 'btn primary');
    const d = modal('插入页面', form, [button('取消', null, () => d.close()), insertButton]);
    return new Promise((resolve) => d.addEventListener('close', () => resolve(), { once: true }));
  }
  function goToPage() {
    if (!pdf) return;
    const input = el('input', {
      type: 'number',
      class: 'input',
      id: 'go-to-page',
      min: 1,
      max: pdf.numPages,
      value: pageIndex + 1,
      required: true,
    });
    const form = el(
      'form',
      {},
      el('label', { for: 'go-to-page' }, `页码（1 到 ${pdf.numPages}）`),
      input,
    );
    const go = () => {
      if (!input.reportValidity()) return;
      const target = Number(input.value) - 1;
      d.close();
      navigate(target);
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      go();
    };
    const d = modal('前往页面', form, [
      button('取消', null, () => d.close()),
      button('前往', null, go, 'btn primary'),
    ]);
    input.focus();
    input.select();
  }
  /** A radio list of page choices shared by the print and extract dialogs. */
  function pageChoices(
    group,
    count,
    { all = group === 'print-pages', start = all ? 'all' : 'current' } = {},
  ) {
    const rangeInput = el('input', {
      type: 'text',
      class: 'input',
      placeholder: 'e.g. 1-3, 5',
      'aria-label': '页码范围',
      inputmode: 'numeric',
      autocomplete: 'off',
    });
    const choice = (value, label, checked) =>
      el(
        'label',
        { class: 'choice-row' },
        el('input', { type: 'radio', name: group, value, checked }),
        el('span', {}, label),
      );
    const rangeChoice = choice('range', '指定页面', false);
    rangeInput.addEventListener('input', () => {
      rangeChoice.querySelector('input').checked = true;
    });
    const list = el(
      'div',
      { class: 'choice-list', role: 'radiogroup', 'aria-label': '包含的页面' },
      all && choice('all', `全部页面 (${count})`, start === 'all'),
      choice('current', `当前页 (${pageIndex + 1})`, start === 'current'),
      el('div', { class: 'choice-with-input' }, rangeChoice, rangeInput),
    );
    return {
      list,
      indices: () => {
        const selected = list.querySelector('input:checked')?.value;
        if (selected === 'all') return Array.from({ length: count }, (_, i) => i);
        return selected === 'current' ? [pageIndex] : parsePageRange(rangeInput.value, count);
      },
    };
  }
  /** A labeled control inside a dialog form; extra nodes sit in a row beside the control. */
  function labeled(id, label, control, ...beside) {
    control.id = id;
    return el(
      'div',
      { class: 'field' },
      el('label', { for: id }, label),
      beside.length ? el('div', { class: 'field-inline' }, control, ...beside) : control,
    );
  }
  function selectInput(id, options, value) {
    return el(
      'select',
      { id, class: 'input' },
      ...options.map(([key, label]) =>
        el('option', { value: key, selected: key === value }, label),
      ),
    );
  }
  /** "the page" or "N pages" for a page range, which can name a page more than once. */
  const pagesPhrase = (indices) => {
    const count = new Set(indices).size;
    return count === 1 ? 'the page' : `${count} pages`;
  };
  /** Stamp a centered text watermark on the chosen pages. */
  function watermarkDialog() {
    if (!pdf) return;
    const text = el('input', {
      class: 'input',
      value: 'CONFIDENTIAL',
      maxlength: 200,
      autocomplete: 'off',
      required: true,
    });
    const layout = selectInput(
      'watermark-layout',
      [
        ['diagonal', 'Diagonal'],
        ['horizontal', 'Horizontal'],
      ],
      'diagonal',
    );
    const size = selectInput(
      'watermark-size',
      Object.keys(WATERMARK_SIZES).map((key) => [key, key[0].toUpperCase() + key.slice(1)]),
      'medium',
    );
    const colorPick = el('input', { type: 'color', value: '#000000' });
    const opacity = el('input', { type: 'range', min: 5, max: 100, step: 5, value: 25 });
    const opacityValue = el('output', { for: 'watermark-opacity' }, '25%');
    opacity.oninput = () => {
      opacityValue.textContent = `${opacity.value}%`;
    };
    const choices = pageChoices('watermark-pages', pdf.numPages, { all: true });
    const form = el(
      'form',
      { class: 'stack' },
      labeled('watermark-text', '文本', text),
      el(
        'div',
        { class: 'field-grid' },
        labeled('watermark-layout', '版式', layout),
        labeled('watermark-size', '字号', size),
        labeled('watermark-color', '颜色', colorPick),
        labeled('watermark-opacity', '不透明度', opacity, opacityValue),
      ),
      el('p', { class: 'muted' }, 'Pages'),
      choices.list,
    );
    const apply = safe(async () => {
      if (!text.value.trim()) {
        toast('请输入水印文本。', { error: true });
        text.focus();
        return;
      }
      const indices = choices.indices();
      await mutateDialog(
        d,
        (doc) =>
          addWatermark(doc, indices, {
            text: text.value.trim(),
            layout: layout.value,
            size: size.value,
            hex: colorPick.value,
            opacity: Number(opacity.value) / 100,
          }),
        `Watermark added to ${pagesPhrase(indices)}.`,
      );
    });
    form.onsubmit = (e) => {
      e.preventDefault();
      apply();
    };
    const d = modal('添加水印', form, [
      button('取消', null, () => d.close()),
      button('添加水印', 'Stamp', apply, 'btn primary'),
    ]);
    text.focus();
    text.select();
  }
  /** Text in the corners and centers of the top and bottom edges, with tokens for numbers and dates. */
  async function headerFooterDialog(version = beginDialogRequest(), { bates = false } = {}) {
    if (!pdf) return;
    const { documentDetails } = await import('./core/details.js');
    const doc = await workingDocument(version);
    if (!doc) return;
    const details = documentDetails(doc, session.bytes);
    const labels = {
      topLeft: '左上方',
      topCenter: '顶部居中',
      topRight: '右上方',
      bottomLeft: '左下方',
      bottomCenter: '底部居中',
      bottomRight: '右下方',
    };
    const inputs = Object.fromEntries(
      HEADER_SLOTS.map((slot) => [
        slot,
        el('input', {
          class: 'input',
          maxlength: 200,
          autocomplete: 'off',
          placeholder:
            slot === 'bottomCenter'
              ? '第 {page} 页 / 共 {pages} 页'
              : slot === 'topLeft'
                ? '{title}'
                : slot === 'topRight'
                  ? '{date}'
                  : '',
        }),
      ]),
    );
    const size = el('input', {
      type: 'number',
      class: 'input',
      value: 10,
      min: 6,
      max: 36,
      step: 'any',
      required: true,
    });
    const choices = pageChoices('header-pages', pdf.numPages, { all: true });
    // Bates numbers count across the chosen pages with a fixed width, prefix, and suffix.
    const batesFields = {
      prefix: el('input', { class: 'input', maxlength: 40, autocomplete: 'off' }),
      start: el('input', { type: 'number', class: 'input', value: 1, min: 0, step: 1 }),
      digits: el('input', { type: 'number', class: 'input', value: 6, min: 1, max: 15, step: 1 }),
      suffix: el('input', { class: 'input', maxlength: 40, autocomplete: 'off' }),
    };
    const batesSection = el(
      'details',
      { class: 'bates-options', ...(bates && { open: true }) },
      el('summary', {}, '贝茨编号'),
      el(
        'p',
        { class: 'muted' },
        '在任意位置填入 {bates} 以对选定页面进行连续编号，例如 ABC000001。',
      ),
      el(
        'div',
        { class: 'field-grid' },
        labeled('bates-prefix', '前缀', batesFields.prefix),
        labeled('bates-start', '起始编号', batesFields.start),
        labeled('bates-digits', '位数', batesFields.digits),
        labeled('bates-suffix', '后缀', batesFields.suffix),
      ),
    );
    if (bates) inputs.bottomRight.value = '{bates}';
    const form = el(
      'form',
      { class: 'stack' },
      el(
        'p',
        { class: 'muted' },
        '可填写六个位置中的任意位置。每个页面将自动填充 {page}、{pages}、{date}、{title}、{file} 和 {bates}。',
      ),
      // Three across, as the places sit on the page: left, center, and right.
      el(
        'div',
        { class: 'field-grid header-slots' },
        ...HEADER_SLOTS.map((slot) => labeled(`header-${slot}`, labels[slot], inputs[slot])),
      ),
      el('div', { class: 'field-grid' }, labeled('header-size', '字号 (磅)', size)),
      batesSection,
      el('p', { class: 'muted' }, '页面'),
      choices.list,
    );
    const apply = safe(async () => {
      const indices = choices.indices();
      const slots = Object.fromEntries(HEADER_SLOTS.map((slot) => [slot, inputs[slot].value]));
      const numbered = Object.values(slots).some((text) => /\{bates\}/i.test(text));
      await mutateDialog(
        d,
        (doc) =>
          addHeaderFooter(doc, indices, {
            slots,
            size: size.value,
            title: details.title || '',
            file: name.replace(/\.pdf$/i, ''),
            bates: numbered
              ? {
                  prefix: batesFields.prefix.value,
                  suffix: batesFields.suffix.value,
                  // An emptied field is no number, not zero.
                  start: batesFields.start.value.trim() ? Number(batesFields.start.value) : NaN,
                  digits: Number(batesFields.digits.value),
                }
              : null,
          }),
        `${bates && numbered ? '贝茨编号' : '页眉和页脚'}已添加到 ${pagesPhrase(indices)}。`,
      );
    });
    form.onsubmit = (e) => {
      e.preventDefault();
      apply();
    };
    const d = modal(bates ? '贝茨编号' : '页眉和页脚', form, [
      button('取消', null, () => d.close()),
      bates
        ? button('添加贝茨编号', 'Hash', apply, 'btn primary')
        : button('添加页眉和页脚', 'PanelTopBottomDashed', apply, 'btn primary'),
    ]);
    d.classList.add('header-footer-dialog');
    (bates ? batesFields.prefix : inputs.topLeft).focus();
  }
  /** Number the chosen pages in a corner or centered at the top or bottom. */
  function pageNumbersDialog() {
    if (!pdf) return;
    const positionLabels = {
      'top-left': '左上方',
      'top-center': '顶部居中',
      'top-right': '右上方',
      'bottom-left': '左下方',
      'bottom-center': '底部居中',
      'bottom-right': '右下方',
    };
    const position = selectInput(
      'numbers-position',
      NUMBER_POSITIONS.map((key) => [key, positionLabels[key] || key]),
      'bottom-center',
    );
    const format = selectInput(
      'numbers-format',
      Object.entries(NUMBER_FORMATS).map(([key, template]) => [
        key,
        template.replace('{n}', '1').replace('{N}', String(pdf.numPages)),
      ]),
      'of',
    );
    const start = el('input', {
      type: 'number',
      class: 'input',
      value: 1,
      min: 0,
      max: 99999,
      step: 1,
      required: true,
    });
    const size = el('input', {
      type: 'number',
      class: 'input',
      value: 11,
      min: 6,
      max: 72,
      step: 'any',
      required: true,
    });
    const choices = pageChoices('numbers-pages', pdf.numPages, { all: true });
    const form = el(
      'form',
      { class: 'stack' },
      el(
        'div',
        { class: 'field-grid' },
        labeled('numbers-position', '位置', position),
        labeled('numbers-format', '格式', format),
        labeled('numbers-start', '起始页码', start),
        labeled('numbers-size', '字号 (磅)', size),
      ),
      el('p', { class: 'muted' }, '页面'),
      choices.list,
    );
    const apply = safe(async () => {
      if (!form.reportValidity()) return;
      const indices = choices.indices();
      await mutateDialog(
        d,
        (doc) =>
          addPageNumbers(doc, indices, {
            format: format.value,
            position: position.value,
            start: start.value,
            size: size.value,
          }),
        `页码已添加到 ${pagesPhrase(indices)}。`,
      );
    });
    form.onsubmit = (e) => {
      e.preventDefault();
      apply();
    };
    const d = modal('添加页码', form, [
      button('取消', null, () => d.close()),
      button('添加页码', 'Hash', apply, 'btn primary'),
    ]);
    position.focus();
  }
  /** Choose what to print, then hand the pages to the browser's print command. */
  function printDialog() {
    requireAccess('print');
    if (!pdf) return;
    const choices = pageChoices('print-pages', pdf.numPages);
    const form = el(
      'form',
      { class: 'stack' },
      el(
        'p',
        { class: 'muted' },
        '每一页都将按适合纸张的比例打印在单独的纸张上。您的浏览器打印对话框可选择打印机、纸张和份数。',
      ),
      choices.list,
    );
    const print = safe(async () => {
      const indices = choices.indices();
      d.close();
      await runPrint(indices);
    });
    form.onsubmit = (e) => {
      e.preventDefault();
      print();
    };
    const d = modal('打印', form, [
      button('取消', null, () => d.close()),
      button('打印', 'Printer', print, 'btn primary'),
    ]);
  }
  /**
   * The layers to print: the PDF's print settings, less the layers switched off in the Layers
   * panel, which print only when visible as other PDF apps do. A layer switched on there still
   * stays off paper when the PDF says it never prints.
   */
  function printLayers() {
    if (!layerChoices.size) return undefined;
    return pdf.getOptionalContentConfig({ intent: 'print' }).then((config) => {
      for (const [id, visible] of layerChoices) {
        const group = config.getGroup(id);
        if (group && (!visible || group.usage?.print?.printState !== 'OFF'))
          config.setVisibility(id, visible);
      }
      return config;
    });
  }
  async function runPrint(indices) {
    requireAccess('print');
    if (busy || destroyed) return;
    // The Print button is disabled while the pages are prepared, which drops its focus; it
    // takes the focus back afterwards, as Undo does, unless the focus has moved on.
    const opener = document.activeElement;
    busy = true;
    updateStatus();
    const controller = new AbortController();
    let handing = false;
    const progress = el('p', { class: 'muted', role: 'status' }, '正在准备页面…');
    const d = modal('正在打印', el('div', { class: 'stack' }, progress), [
      button('取消', null, () => controller.abort()),
    ]);
    // Escape and the close button cancel too; the dialog also closes on its own right before
    // the browser's print dialog takes over.
    d.addEventListener('close', () => {
      if (!handing) controller.abort();
    });
    try {
      await printPages(pdf, indices, {
        maxDpi: access().printHighQuality ? Infinity : 150,
        layers: printLayers(),
        signal: controller.signal,
        onProgress: (done, total) => {
          if (done < total) {
            progress.textContent = `正在准备第 ${done + 1} 页，共 ${total} 页…`;
            return;
          }
          handing = true;
          d.close();
        },
      });
    } catch (error) {
      if (!['AbortError', 'RenderingCancelledException'].includes(error?.name)) throw error;
    } finally {
      if (d.open) d.close();
      busy = false;
      updateStatus();
      if (
        opener?.isConnected &&
        opener !== document.body &&
        !opener.disabled &&
        (!document.activeElement || document.activeElement === document.body)
      )
        opener.focus({ preventScroll: true });
    }
  }
  /** Save one page as a PNG picture at 144 dpi, with its annotations. */
  function downloadPageImage(index) {
    return exportPageImages([index], { type: 'image/png', dpi: 144 });
  }
  /** Show and edit the document's title, author, subject, and keywords, with its facts. */
  async function detailsDialog(version = beginDialogRequest()) {
    if (!pdf) return;
    const { documentDetails, setDocumentDetails } = await import('./core/details.js');
    const doc = await workingDocument(version);
    if (!doc) return;
    const details = documentDetails(doc, session.bytes);
    const inputs = {};
    const initialValues = {};
    const rows = [
      ['title', 'Title'],
      ['author', 'Author'],
      ['subject', 'Subject'],
      ['keywords', 'Keywords'],
    ].map(([key, label]) => {
      const input = el('textarea', {
        class: 'input',
        id: `detail-${key}`,
        readOnly: !access().edit,
        maxlength: 1000,
        autocomplete: 'off',
      });
      input.value = details[key];
      inputs[key] = input;
      // Textareas display line breaks but normalize CR/CRLF to LF. Compare with
      // the initial control value so untouched source metadata remains exact.
      initialValues[key] = input.value;
      const resize = () => {
        input.rows = Math.max(key === 'subject' ? 2 : 1, input.value.split('\n', 4).length);
      };
      resize();
      input.addEventListener('input', resize);
      return el('div', { class: 'field' }, el('label', { for: `detail-${key}` }, label), input);
    });
    const when = (date) =>
      date ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
    const facts = [
      ['页数', String(details.pages)],
      ['文件大小', formatBytes(details.size)],
      ['创建时间', when(details.created)],
      ['修改时间', when(details.modified)],
      ['创建工具', details.creator],
      ['生成工具', details.producer],
    ].filter(([, value]) => value);
    // How the PDF asks to open, and the fonts its pages use.
    const view = readInitialView(doc);
    const layout = selectInput(
      'detail-layout',
      [
        ['default', '默认'],
        ['single', '单页'],
        ['continuous', '单页连续滚动'],
        ['two', '双页'],
        ['two-continuous', '双页连续滚动'],
      ],
      view.layout,
    );
    const panel = selectInput(
      'detail-panel',
      [
        ['none', '仅页面'],
        ['bookmarks', '书签面板和页面'],
        ['pages', '页面面板和页面'],
        ['attachments', '附件面板和页面'],
        ['layers', '图层面板和页面'],
      ],
      view.panel,
    );
    const openPage = el('input', {
      class: 'input',
      type: 'number',
      min: 1,
      max: details.pages,
      step: 1,
      value: view.page + 1,
    });
    const zoom = selectInput(
      'detail-zoom',
      [
        ['default', '默认'],
        ['fit', '适合宽度'],
        ['page', '适合整页'],
        // A magnification the list lacks is offered as the file has it, so it is kept.
        ...[0.5, 0.75, 1, 1.25, 1.5, 2, view.zoom]
          .filter((value, i, all) => typeof value === 'number' && all.indexOf(value) === i)
          .sort((a, b) => a - b)
          .map((value) => [String(value), `${Math.round(value * 1000) / 10}%`]),
      ],
      String(view.zoom),
    );
    const displayTitle = el('input', {
      type: 'checkbox',
      id: 'detail-display-title',
      checked: view.displayTitle,
    });
    const initialView = el(
      'details',
      { class: 'detail-section' },
      el('summary', {}, '初始视图'),
      el(
        'div',
        { class: 'field-grid' },
        labeled('detail-layout', '页面布局', layout),
        labeled('detail-panel', '导航', panel),
        labeled('detail-open-page', '打开到页码', openPage),
        labeled('detail-zoom', '缩放比例', zoom),
      ),
      el(
        'label',
        { class: 'checkbox-row', for: 'detail-display-title' },
        el('span', {}, '窗口显示文档中存储的标题，而非文件名'),
        displayTitle,
      ),
    );
    const fonts = listFonts(doc);
    const fontList = el(
      'details',
      { class: 'detail-section' },
      el('summary', {}, `字体（${fonts.length}）`),
      fonts.length
        ? el(
            'ul',
            { class: 'detail-fonts' },
            ...fonts.map((font) =>
              el(
                'li',
                {},
                el('span', {}, font.name),
                el(
                  'span',
                  { class: 'muted' },
                  `${font.type}${font.encoding ? `, ${font.encoding}` : ''}, ${
                    font.embedded ? (font.subset ? 'embedded subset' : 'embedded') : 'not embedded'
                  }`,
                ),
              ),
            ),
          )
        : el('p', { class: 'muted' }, '这些页面未使用字体。'),
    );
    if (!access().edit)
      [layout, panel, openPage, zoom, displayTitle].forEach((control) => (control.disabled = true));
    const form = el(
      'form',
      { class: 'stack' },
      ...rows,
      el(
        'dl',
        { class: 'detail-facts' },
        ...facts.flatMap(([term, value]) => [el('dt', {}, term), el('dd', {}, value)]),
      ),
      initialView,
      fontList,
    );
    const apply = safe(async () => {
      const values = Object.fromEntries(
        Object.entries(inputs)
          .filter(([key, input]) => input.value !== initialValues[key])
          .map(([key, input]) => [key, input.value]),
      );
      const zoomValue = ['default', 'fit', 'page'].includes(zoom.value)
        ? zoom.value
        : Number(zoom.value);
      const next = {
        layout: layout.value,
        panel: panel.value,
        page: Math.max(0, Math.min(details.pages - 1, Number(openPage.value) - 1 || 0)),
        zoom: zoomValue,
        displayTitle: displayTitle.checked,
      };
      const viewChanges = Object.fromEntries(
        Object.entries(next).filter(([key, value]) => value !== view[key]),
      );
      await mutateDialog(d, (doc) => {
        let changed = setDocumentDetails(doc, values);
        if (Object.keys(viewChanges).length) {
          writeInitialView(doc, viewChanges);
          changed = true;
        }
        return changed;
      });
    });
    form.onsubmit = (e) => {
      e.preventDefault();
      apply();
    };
    const d = modal('文档属性', form, [
      button('取消', null, () => d.close()),
      ...(access().edit ? [button('保存属性', 'Check', apply, 'btn primary')] : []),
    ]);
    inputs.title.focus();
  }
  /** Save the chosen pages as PNG or JPEG pictures, one file or a ZIP of them. */
  function pageImagesDialog() {
    requireAccess('copy');
    if (!pdf) return;
    const format = selectInput(
      'images-format',
      [
        ['image/png', 'PNG（清晰，文件较大）'],
        ['image/jpeg', 'JPEG（文件较小）'],
      ],
      'image/png',
    );
    const dpi = selectInput(
      'images-dpi',
      [
        ['72', '72 dpi (screen)'],
        ['144', '144 dpi (sharp)'],
        ['300', '300 dpi (print)'],
      ],
      '144',
    );
    const choices = pageChoices('images-pages', pdf.numPages, { all: true });
    const form = el(
      'form',
      { class: 'stack' },
      el(
        'p',
        { class: 'muted' },
        '每个页面都将转为带有其批注的图片。单个页面直接下载；多个页面将打包为 ZIP 下载。',
      ),
      el(
        'div',
        { class: 'field-grid image-export-fields' },
        labeled('images-format', '格式', format),
        labeled('images-dpi', '分辨率', dpi),
      ),
      el('p', { class: 'muted' }, 'Pages'),
      choices.list,
    );
    const apply = safe(async () => {
      const indices = choices.indices();
      d.close();
      await exportPageImages(indices, { type: format.value, dpi: Number(dpi.value) });
    });
    form.onsubmit = (e) => {
      e.preventDefault();
      apply();
    };
    const d = modal('将页面下载为图片', form, [
      button('取消', null, () => d.close()),
      button('下载', 'ImageDown', apply, 'btn primary'),
    ]);
    format.focus();
  }
  /**
   * Render the chosen pages to pictures and download them. Rendering a complex page or many
   * pages takes a while, so the editor is held busy behind a progress dialog that can
   * cancel it: an edit part way through would reload the document out from under the render.
   */
  async function exportPageImages(indices, { type, dpi }) {
    requireAccess('copy');
    if (busy || destroyed || !pdf) return;
    // Overlapping ranges describe the same picture. Render each page once, retaining
    // the requested order and avoiding duplicate filenames inside the archive.
    indices = [...new Set(indices)];
    busy = true;
    updateStatus();
    const controller = new AbortController();
    const progress = el('p', { class: 'muted', role: 'status' }, '正在准备页面…');
    const d = modal('正在将页面下载为图片', el('div', { class: 'stack' }, progress), [
      button('取消', null, () => controller.abort()),
    ]);
    // Escape and the close button cancel too; the dialog closes on its own when done.
    let done = false;
    d.addEventListener('close', () => {
      if (!done) controller.abort();
    });
    const thisPdf = pdf,
      extension = type === 'image/jpeg' ? 'jpg' : 'png',
      base = safeName(name).replace(/\.pdf$/i, '');
    try {
      const files = [];
      let picture;
      for (const [k, index] of indices.entries()) {
        controller.signal.throwIfAborted();
        progress.textContent = `正在渲染第 ${k + 1} 页，共 ${indices.length} 页…`;
        const blob = await pageImage(thisPdf, index, { dpi, type, signal: controller.signal });
        if (destroyed) return;
        // Limit the base before adding the page number so long names cannot collide in a ZIP.
        const fileName = `${base} page ${index + 1}.${extension}`;
        // A single image can download directly; only a ZIP needs a copy of its bytes.
        if (indices.length === 1) picture = { name: fileName, blob };
        else files.push({ name: fileName, bytes: new Uint8Array(await blob.arrayBuffer()) });
      }
      controller.signal.throwIfAborted();
      done = true;
      if (picture) download(picture.blob, picture.name);
      else download(new Blob(zipParts(files), { type: 'application/zip' }), `${base} pages.zip`);
      const kind = type === 'image/jpeg' ? 'JPEG' : 'PNG';
      toast(
        indices.length === 1
          ? `Page ${indices[0] + 1} downloaded as a ${kind} picture.`
          : `${files.length} pages downloaded as ${kind} pictures in a ZIP.`,
      );
    } catch (error) {
      if (!['AbortError', 'RenderingCancelledException'].includes(error?.name)) throw error;
    } finally {
      done = true;
      if (d.open) d.close();
      busy = false;
      updateStatus();
    }
  }
  /* ---------- Comments drawn as annotations ---------- */
  /**
   * Ask for a comment's text and add the comment with `add(doc, text)`; resolves when the
   * dialog closes. Words that cannot be added (a script the text font lacks) stay in the
   * dialog to be changed, rather than being lost with it.
   */
  function commentTextDialog(title, add) {
    return new Promise((resolve) => {
      const area = el('textarea', { class: 'input', rows: 4, maxlength: 20000 });
      const done = safe(async () => {
        // An empty box would be a frame with nothing to read, left on the page.
        if (!area.value.trim()) {
          toast(`Write something in the ${title.toLowerCase()}.`, { error: true });
          area.focus();
          return;
        }
        try {
          await mutateDialog(d, (doc) => add(doc, area.value), null, 'annotate');
        } finally {
          // The text field, disabled while the comment was added, takes the keyboard back.
          if (d.open && !destroyed) area.focus();
        }
      });
      area.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          done();
        }
      });
      const d = modal(
        title,
        el('div', { class: 'stack' }, labeled('comment-text', '文本', area)),
        [button('取消', null, () => d.close()), button('添加', null, done, 'btn primary')],
        dialogOptions,
      );
      d.addEventListener('close', () => resolve(), { once: true });
      area.focus();
    });
  }
  /** Draw the clicked corners of a perimeter or an area, and the edge to the pointer. */
  let measurePage = 0;
  function drawMeasurePath(pointer) {
    const ctx = clearOverlay();
    if (!measurePath.length) return;
    ctx.setTransform(overlay.width / viewport.width, 0, 0, overlay.height / viewport.height, 0, 0);
    ctx.strokeStyle = toolColors.comment;
    ctx.lineWidth = 1.5;
    const screen = measurePath.map((point) => viewport.convertToViewportPoint(point.x, point.y));
    ctx.beginPath();
    screen.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (pointer) ctx.lineTo(pointer.x, pointer.y);
    if (measureMode.value === 'area') ctx.closePath();
    ctx.stroke();
    const points = pointer ? [...measurePath, pdfPoint(pointer)] : measurePath;
    hint.textContent = measureLabel(measureMode.value === 'area' ? 'area' : 'distance', points, {
      ...measureScale,
      userUnit: viewport.userUnit,
    });
  }
  overlay.addEventListener('pointermove', (e) => {
    if (tool === 'measure' && measurePath.length && measurePage === pageIndex && !gesture)
      drawMeasurePath(screenPoint(e));
  });
  overlay.addEventListener('dblclick', () => {
    if (tool === 'measure' && measurePath.length) safe(finishMeasure)();
  });
  /** Turn the clicked corners into a measured comment: a path or an area with its label. */
  async function finishMeasure() {
    // A double-click also clicked the last corner twice.
    const points = measurePath.filter(
      (point, i, all) => !i || Math.hypot(point.x - all[i - 1].x, point.y - all[i - 1].y) > 0.5,
    );
    const page = measurePage;
    measurePath = [];
    clearOverlay();
    const area = measureMode.value === 'area';
    if (points.length < (area ? 3 : 2)) {
      hint.textContent = measureHint();
      return;
    }
    await addMeasurement(page, area ? 'area' : 'perimeter', points);
  }
  async function addMeasurement(page, kind, points) {
    const scale = { ...measureScale, userUnit: viewport.userUnit };
    const label = measureLabel(kind === 'area' ? 'area' : 'distance', points, scale);
    const author = getUser()?.username || '';
    const xs = points.map((p) => p.x),
      ys = points.map((p) => p.y);
    const center =
      kind === 'distance'
        ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
        : {
            x: (Math.min(...xs) + Math.max(...xs)) / 2,
            y: (Math.min(...ys) + Math.max(...ys)) / 2,
          };
    const fontSize = 9 / viewport.userUnit;
    const labelWidth = label.length * fontSize * 0.6 + 8 / viewport.userUnit,
      labelHeight = fontSize * 1.6;
    // The label sits centered just above the middle, as the page reads, turned or not; below
    // it by the top edge of the page, and moved in from the sides, so it stays on the page.
    const [cx, cy] = viewport.convertToViewportPoint(center.x, center.y);
    const unit = screenUnit();
    const above = cy - (2 + labelHeight) * unit;
    const labelRect = readerRectOnPage(
      { x: cx - (labelWidth / 2) * unit, y: above >= 0 ? above : cy + 2 * unit },
      labelWidth,
      labelHeight,
    );
    await mutate(
      async (doc) => {
        const shape = addShapeAnnotation(doc, page, {
          kind: kind === 'area' ? 'polygon' : kind === 'distance' ? 'line' : 'polyline',
          points,
          color: toolColors.comment,
          width: 1 / viewport.userUnit,
          author,
          text: label,
        });
        const caption = await addTextBox(doc, page, {
          rect: labelRect,
          text: label,
          fontSize,
          color: toolColors.comment,
          fill: '#ffffff',
          borderWidth: 0,
          align: 'center',
          author,
        });
        // The label is part of the measurement: listed with it, and moved or deleted with it.
        groupAnnotation(doc, page, caption, shape);
      },
      `Measured: ${label}.`,
      'annotate',
    );
    hint.textContent = measureHint();
  }
  /** Place the comment a gesture drew: a text box, a callout, a shape, or a pencil stroke. */
  async function placeComment(g, end) {
    const author = getUser()?.username || '';
    const hex = g.hex;
    // At least half a point, in the page's own units, which may be larger than points.
    const width = Math.max(0.5 / viewport.userUnit, g.width);
    const moved = Math.hypot(end.x - g.start.x, end.y - g.start.y) >= 4;
    // A drag along a line holds no box: a text box then takes its clicked size, and a box
    // shape is not drawn, as for a click, instead of hiding its words or failing.
    const boxed = Math.min(Math.abs(end.x - g.start.x), Math.abs(end.y - g.start.y)) >= 8;
    if (g.type === 'measure') {
      if (!moved) return;
      return addMeasurement(g.page, 'distance', [pdfPoint(g.start), pdfPoint(end)]);
    }
    if (g.type === 'pencil') {
      if (g.points.length < 2) return;
      const points = g.points.map(pdfPoint);
      return commitDrawing(
        (doc) => addInkAnnotation(doc, g.page, { strokes: [points], color: hex, width, author }),
        'annotate',
      );
    }
    if (g.type === 'cshape') {
      const kind = g.commentKind;
      if (!moved || (!boxed && kind !== 'line' && kind !== 'arrow')) return;
      const from = pdfPoint(g.start),
        to = pdfPoint(end);
      return commitDrawing(
        (doc) =>
          addShapeAnnotation(doc, g.page, {
            kind,
            ...(kind === 'line' || kind === 'arrow'
              ? { points: [from, to] }
              : { rect: normalizeRect(from, to) }),
            color: hex,
            width,
            author,
          }),
        'annotate',
      );
    }
    // Sizes in points: a page with a UserUnit has larger units than that.
    const pt = 1 / viewport.userUnit;
    const fontSize = commentSize * pt,
      borderWidth = pt;
    if (g.type === 'textbox') {
      const rect = boxed
        ? normalizeRect(pdfPoint(g.start), pdfPoint(end))
        : readerRectOnPage(g.start, 180 * pt, 50 * pt);
      return commentTextDialog('文本框', (doc, text) =>
        addTextBox(doc, g.page, {
          rect,
          text,
          fontSize,
          borderColor: hex,
          borderWidth,
          author,
          // Taller, as the words need, so none are hidden below the box.
          fit: true,
        }),
      );
    }
    if (g.type === 'callout') {
      const anchor = pdfPoint(g.start);
      const corner = moved ? end : { x: g.start.x + 60, y: g.start.y - 60 };
      // The box grows from the dragged-to corner away from its point, which it must not cover:
      // leftwards when dragged to the left, upwards when dragged straight up.
      const unit = screenUnit() * pt;
      const [w, h] = [180 * unit, 50 * unit];
      const x = corner.x < g.start.x ? corner.x - w : corner.x;
      const y = corner.x === g.start.x && corner.y < g.start.y ? corner.y - h : corner.y;
      // Moved onto the page, as long as it does not cover the point; a click by the right
      // edge may put the box on the point's left instead.
      const onPage = [x, ...(moved ? [] : [g.start.x - 60 - w])]
        .map((left) => ({
          x: Math.max(0, Math.min(left, viewport.width - w)),
          y: Math.max(0, Math.min(y, viewport.height - h)),
        }))
        .find(
          (box) =>
            g.start.x < box.x ||
            g.start.x > box.x + w ||
            g.start.y < box.y ||
            g.start.y > box.y + h,
        );
      const rect = readerRect(onPage ?? { x, y }, 180 * pt, 50 * pt);
      return commentTextDialog('Callout', (doc, text) =>
        addCallout(doc, g.page, {
          rect,
          anchor,
          text,
          fontSize,
          borderColor: hex,
          borderWidth,
          author,
          fit: true,
        }),
      );
    }
  }
  async function removeAnnotation(entry) {
    await mutate(
      (doc) => deleteAnnotation(doc, pageIndex, entry.id),
      `${entry.kind} deleted.`,
      'annotate',
    );
    // The deleted comment or its Delete button held the focus; keep it on the page, as
    // deleting a markup does.
    if (!destroyed && document.activeElement === document.body)
      overlay.focus({ preventScroll: true });
  }
  /**
   * A comment's review status, its replies (and theirs, beneath them), and a box to reply:
   * the same controls for every kind of comment. `run(operation, message, control)` applies
   * `operation(doc, id)`; `control` is the label of the control that made the change, for
   * panels that are drawn again afterwards to give the keyboard focus back to.
   */
  function commentThread(entry, run) {
    const author = () => getUser()?.username || '';
    const status = el(
      'select',
      {
        'aria-label': '审阅状态',
        disabled: !access().annotate,
        onchange: () =>
          safe(() =>
            run(
              (doc, id) =>
                setReviewState(doc, pageIndex, id, { state: status.value, author: author() }),
              `状态已设为 ${status.value}。`,
              '审阅状态',
            ),
          )(),
      },
      ...REVIEW_STATES.map((state) =>
        el('option', { value: state, selected: (entry.state || 'None') === state }, state),
      ),
    );
    const replyText = el('textarea', {
      class: 'input',
      rows: 2,
      placeholder: '写回复',
      'aria-label': '回复内容',
    });
    const reply = safe(async () => {
      const text = replyText.value.trim();
      if (!text) return;
      // A panel drawn again while the reply is added does not carry it over as a draft.
      replyText.dataset.sent = replyText.value;
      try {
        await run(
          (doc, id) => addReply(doc, pageIndex, id, { text, author: author() }),
          '回复已添加。',
          '回复内容',
        );
      } finally {
        delete replyText.dataset.sent;
      }
    });
    // In a note's panel Ctrl+Enter saves the note; in the reply box it sends the reply.
    replyText.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.isComposing) return;
      e.preventDefault();
      e.stopPropagation();
      reply();
    });
    const when = (date) =>
      date ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
    // Replies to a reply sit beneath it, as in the thread they belong to.
    const replyItems = (items) =>
      items.map((item) =>
        el(
          'li',
          {},
          el(
            'span',
            { class: 'reply-meta muted' },
            [item.author, when(item.modified)].filter(Boolean).join(' · '),
          ),
          el('span', { class: 'reply-text' }, item.contents || ''),
          item.replies?.length > 0 &&
            el('ul', { class: 'annotation-replies' }, ...replyItems(item.replies)),
        ),
      );
    const replies = replyItems(entry.replies || []);
    return {
      status: el('label', { class: 'annotation-status' }, el('span', {}, '状态'), status),
      replies:
        replies.length > 0 &&
        el('ul', { class: 'annotation-replies', 'aria-label': '回复' }, ...replies),
      replyText,
      replyButton: button('回复', null, reply, 'btn', { disabled: !access().annotate }),
    };
  }
  /** The selected comment's text, look, replies, and review status in the properties panel. */
  function showAnnotationProperties(entry) {
    annotationTextDraft = null;
    if (!entry) return properties.clear('annotation');
    // A stamp keeps its own art and a read-only comment takes no change: offer only what applies.
    const editable = entry.editable && !entry.locked && !entry.readOnly && access().annotate;
    const accepts = (key) => editable && annotationAccepts(entry.subtype, key);
    // Leaving the Comment field for another control saves it, and the click that left it
    // would otherwise find the editor busy with that save and be dropped: it waits instead.
    const afterText = (action) =>
      safe(async () => {
        await saveText();
        if (!destroyed) await action();
      })();
    const apply = (changes, message = null) =>
      afterText(() =>
        mutate((doc) => editAnnotation(doc, pageIndex, entry.id, changes), message, 'annotate', {
          retainScale: true,
        }),
      );
    const text = el('textarea', {
      class: 'input',
      rows: 3,
      maxlength: 20000,
      'aria-label': entry.subtype === 'FreeText' ? '文本' : '批注',
      readOnly: !!entry.lockedContents || !!entry.readOnly || !access().annotate,
    });
    text.value = entry.contents || '';
    // Saved once, from whichever comes first: the field's change or a save of the PDF.
    let savedText = text.value,
      savingText = null;
    const saveText = () => {
      if (text.readOnly || !text.isConnected || text.value === savedText) return savingText;
      const previous = savedText,
        value = (savedText = text.value);
      return (savingText = mutate(
        (doc) => editAnnotation(doc, pageIndex, entry.id, { contents: value }),
        null,
        'annotate',
        { retainScale: true },
      ).catch((error) => {
        savedText = previous;
        throw error;
      }));
    };
    annotationTextDraft = saveText;
    text.addEventListener('change', () => safe(saveText)());
    const color = el('input', {
      type: 'color',
      value: entry.color || '#e5322d',
      'aria-label': entry.subtype === 'FreeText' ? '文字颜色' : '颜色',
      disabled: !accepts('color'),
      onchange: () => apply({ color: color.value }),
    });
    const fillable = ['Square', 'Circle', 'Polygon', 'FreeText'].includes(entry.subtype);
    const fill = el('input', {
      type: 'color',
      value: entry.fill || '#ffffff',
      'aria-label': '填充颜色',
      disabled: !accepts('fill'),
      onchange: () => apply({ fill: fill.value }),
    });
    const noFill = el('input', {
      type: 'checkbox',
      checked: !entry.fill,
      'aria-label': '无填充',
      disabled: !accepts('fill'),
      onchange: () => apply({ fill: noFill.checked ? null : fill.value }),
    });
    // Widths and sizes in points, which a page with a UserUnit makes larger than its units.
    const pagePt = viewport.userUnit;
    const points = (entry.width ?? 1) * pagePt;
    const width = el(
      'select',
      {
        'aria-label': '线宽',
        disabled: !accepts('width'),
        onchange: () => apply({ width: Number(width.value) / pagePt }),
      },
      // A width from another editor is listed too, so the field shows the width it has.
      ...[0.5, 1, 2, 3, 4, 6, 8, Math.round(points * 100) / 100]
        .filter((n, i, all) => all.findIndex((m) => Math.abs(m - n) < 0.01) === i)
        .sort((a, b) => a - b)
        .map((n) => el('option', { value: n, selected: Math.abs(points - n) < 0.01 }, `${n} pt`)),
    );
    const opacity = el('input', {
      type: 'range',
      min: 10,
      max: 100,
      step: 5,
      value: Math.round((entry.opacity ?? 1) * 100),
      'aria-label': '不透明度',
      disabled: !accepts('opacity'),
      onchange: () => apply({ opacity: Number(opacity.value) / 100 }),
    });
    const fontSize =
      entry.subtype === 'FreeText' &&
      el('input', {
        type: 'number',
        // The sizes a text box takes, 1 to 288 points; the field reports any other value itself.
        min: 1,
        max: 288,
        step: 'any',
        required: true,
        value: Number(((entry.fontSize || 12 / pagePt) * pagePt).toPrecision(12)),
        'aria-label': '字号',
        disabled: !accepts('fontSize'),
        onchange: () => {
          if (fontSize.reportValidity()) apply({ fontSize: Number(fontSize.value) / pagePt });
        },
      });
    const when = (date) =>
      date ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
    const thread = commentThread(entry, async (operation, message, control) => {
      await saveText();
      await mutate((doc) => operation(doc, entry.id), message, 'annotate', { retainScale: true });
      // A reply sent leaves the reply box ready for the next, as for notes and markups.
      const active = document.activeElement;
      if (!destroyed && (active === document.body || properties.root.contains(active)))
        [...properties.root.querySelectorAll('.annotation-props [aria-label]')]
          .find((node) => node.getAttribute('aria-label') === control)
          ?.focus({ preventScroll: true });
    });
    const panel = el(
      'div',
      { class: 'annotation-props', 'data-comment-id': entry.id },
      el(
        'p',
        { class: 'muted annotation-meta' },
        [entry.author, when(entry.modified)].filter(Boolean).join(' · ') || entry.kind,
      ),
      text,
      el(
        'div',
        { class: 'annotation-style' },
        el('label', {}, el('span', {}, '颜色'), color),
        fillable && el('label', {}, el('span', {}, '填充'), fill),
        // Said in words: a bare tick beside Fill read as "filled" for a shape with no fill.
        fillable && el('label', { class: 'annotation-check' }, noFill, el('span', {}, '无填充')),
        // A text box without a frame has no line for a width to change.
        annotationAccepts(entry.subtype, 'width') &&
          (entry.subtype !== 'FreeText' || entry.borderColor) &&
          el('label', {}, el('span', {}, '线宽'), width),
        el('label', {}, el('span', {}, '不透明度'), opacity),
        fontSize && el('label', {}, el('span', {}, '字号'), fontSize),
      ),
      thread.status,
      thread.replies,
      thread.replyText,
      el(
        'div',
        { class: 'annotation-actions' },
        thread.replyButton,
        button('删除', 'Trash2', () => afterText(() => removeAnnotation(entry)), 'btn danger', {
          disabled: entry.locked || entry.readOnly || !access().annotate,
        }),
      ),
    );
    // Redrawn after an edit, the panel keeps its place and the keyboard on the same control.
    const previous = properties.root.querySelector(
      `.annotation-props[data-comment-id="${entry.id}"]`,
    );
    const scroller = previous?.parentElement,
      scrollTop = scroller?.scrollTop;
    const active = document.activeElement;
    const held = previous?.contains(active) ? active.getAttribute('aria-label') : null;
    // Words typed and not yet saved or sent stay in their fields, where typing goes on.
    const typed = previous?.drafts?.();
    if (typed?.text != null && !text.readOnly) text.value = typed.text;
    if (typed?.reply) thread.replyText.value = typed.reply;
    panel.drafts = () => {
      const sent = thread.replyText.dataset.sent ?? '';
      const reply = thread.replyText.value;
      return {
        text: text.value === savedText ? null : text.value,
        reply: reply.startsWith(sent) ? reply.slice(sent.length) : reply,
      };
    };
    // Escape lets go of the comment from its settings too, as from the comment itself; words
    // typed into its text are kept.
    panel.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      safe(async () => {
        await saveText();
        if (destroyed) return;
        annotationLayer.clear();
        overlay.focus({ preventScroll: true });
      })();
    });
    properties.show('annotation', entry.kind, panel);
    if (previous && scroller === panel.parentElement) scroller.scrollTop = scrollTop;
    const control =
      held &&
      [...panel.querySelectorAll('[aria-label]')].find(
        (node) => node.getAttribute('aria-label') === held,
      );
    control?.focus({ preventScroll: true });
    if (control && control.value === active.value && typeof active.selectionStart === 'number')
      control.setSelectionRange(
        active.selectionStart,
        active.selectionEnd,
        active.selectionDirection,
      );
  }
  /** Comments out as XFDF (as other PDF editors exchange them) or a plain text summary. */
  async function exportComments(kind) {
    // As for a download: a note being written and edits still being applied go out too.
    await idle();
    if (destroyed) return;
    await finishDrafts();
    if (destroyed) return;
    const doc = await PDFDocument.load(session.bytes, { updateMetadata: false });
    const base = safeName(name).replace(/\.pdf$/i, '');
    // A file with nothing in it would only leave the reader wondering what went wrong.
    if (!doc.getPages().some((page) => listAnnotations(doc, page).length)) {
      toast('此 PDF 没有可导出的批注。');
      return;
    }
    if (kind === 'summary') {
      download(
        new Blob([exportCommentSummary(doc)], { type: 'text/plain' }),
        `${base} comments.txt`,
      );
      return;
    }
    download(
      new Blob([exportXfdf(doc)], { type: 'application/vnd.adobe.xfdf' }),
      `${base} comments.xfdf`,
    );
  }
  function importComments() {
    requireAccess('annotate');
    const input = el('input', { type: 'file', accept: '.xfdf,application/vnd.adobe.xfdf,.xml' });
    input.onchange = safe(async () => {
      const file = input.files?.[0];
      if (!file) return;
      // Reading a file that cannot be imported anyway would only hold up the tab.
      if (file.size > MAX_XFDF_SIZE) throw new Error('此批注文件过大，无法导入。');
      const xfdf = await file.text();
      let result = null;
      await mutate(
        async (doc) => {
          result = await importXfdf(doc, xfdf);
          return result.imported ? undefined : false;
        },
        null,
        'annotate',
      );
      if (!result) return;
      const { imported, skipped } = result;
      // Counted as the Comments panel shows them: replies and review statuses are not comments
      // of their own.
      const count = (n, one, many) => (n ? [`${n} ${n === 1 ? one : many}`] : []);
      const parts = [
        ...count(result.comments, 'comment', 'comments'),
        ...count(result.replies, 'reply', 'replies'),
        ...count(result.statuses, 'review status', 'review statuses'),
      ];
      if (!parts.length) parts.push(...count(imported, 'comment', 'comments'));
      const added = imported
        ? `${new Intl.ListFormat('en').format(parts)} imported.`
        : skipped
          ? '未导入任何批注。'
          : '没有可导入的新批注。';
      // Comments left out must not pass by unnoticed: they are missing from the PDF.
      if (skipped)
        toast(
          `${added} ${skipped} ${skipped === 1 ? 'comment' : 'comments'} in the file could not be added.`,
          { error: true },
        );
      else toast(added);
    });
    input.click();
  }
  /* ---------- Prepare a form ---------- */
  const FIELD_DEFAULTS = {
    dropdown: { options: ['选项 1', '选项 2', '选项 3'] },
    listbox: { options: ['选项 1', '选项 2', '选项 3'] },
    button: { label: 'Button' },
    radio: { exportValue: '选项 1' },
  };
  async function refreshDesigner() {
    if (!preparing || !pdf || !viewport) return;
    const doc = editDocument || (await loadPdfDocument(session.bytes, { updateMetadata: false }));
    if (!preparing || destroyed) return;
    editDocument = doc;
    const { listFormFields } = await loadForms();
    try {
      formFields = listFormFields(doc);
    } catch {
      formFields = [];
    }
    designer.render(
      formFields.filter((field) => field.page === pageIndex && field.rect),
      viewport,
    );
    designer.setEnabled(true);
    toolsPanel.refresh();
  }
  function setPreparing(on) {
    preparing = on;
    designer.setEnabled(on);
    pageForms.setEnabled(tool === 'select' && !preparing);
    if (tool === 'select' && access().owner) hint.textContent = forPointer(selectHint());
    if (on) refreshDesigner().catch(() => {});
  }
  /**
   * An edit of the form's fields. What was typed into a field and not yet applied goes into the
   * PDF first: the redrawn page starts its fields afresh from the PDF.
   */
  async function formDesignEdit(...edit) {
    await finishDrafts();
    return mutate(...edit);
  }
  async function createField(rect, page) {
    let created = null;
    await formDesignEdit(
      async (doc) => {
        created = await (
          await loadForms()
        ).addFormField(doc, page, {
          type: fieldType,
          rect,
          ...(FIELD_DEFAULTS[fieldType] || {}),
        });
      },
      null,
      'edit',
    );
    if (!created || destroyed) return;
    await refreshDesigner();
    const field = formFields.find((entry) => entry.name === created);
    designer.focusField(created);
    if (field) pageDialog(() => fieldPropertiesDialog(field, { created: true }))();
  }
  async function removeFormField(field) {
    await formDesignEdit(
      async (doc) => (await loadForms()).deleteFormField(doc, field.name, field.widgetIndex),
      `${fieldTypeLabel(field.type)} ${field.name} deleted.`,
      'edit',
    );
  }
  /** Visit every page's fields by rows or by columns; an order already in place is no edit. */
  async function orderFieldTabs(order) {
    let changed = null;
    await formDesignEdit(async (doc) => {
      const { setFieldTabOrder } = await loadForms();
      const results = doc.getPageIndices().map((i) => setFieldTabOrder(doc, i, order));
      changed = results.some((result) => result !== false);
      return changed ? undefined : false;
    }, `Fields are visited ${order} by ${order}.`);
    if (changed === false && !destroyed) toast(`Fields are already visited ${order} by ${order}.`);
  }
  /** Name, tooltip, flags, and the settings of the field's type. */
  async function fieldPropertiesDialog(field, { created = false } = {}) {
    const { BUTTON_STYLES, listFormFields, moveFormWidget, updateFormField } = await loadForms();
    const props = field.props || {};
    const checkbox = (id, label, checked) => {
      const box = el('input', { type: 'checkbox', id, checked: !!checked });
      return {
        box,
        row: el('label', { class: 'checkbox-row', for: id }, el('span', {}, label), box),
      };
    };
    const nameInput = el('input', { class: 'input', value: field.name, maxlength: 120 });
    const tooltip = el('input', { class: 'input', value: props.tooltip || '', maxlength: 300 });
    const required = checkbox('field-required', 'Required', props.required);
    const readOnly = checkbox('field-readonly', '只读', props.readOnly);
    const border = el('input', { type: 'color', value: props.borderColor || '#000000' });
    const noBorder = checkbox('field-no-border', '无边框', !props.borderColor);
    const fill = el('input', { type: 'color', value: props.backgroundColor || '#ffffff' });
    const noFill = checkbox('field-no-fill', '无填充', !props.backgroundColor);
    // Choosing a color means having one.
    border.addEventListener('input', () => (noBorder.box.checked = false));
    fill.addEventListener('input', () => (noFill.box.checked = false));
    const fontSize = el('input', {
      class: 'input',
      type: 'number',
      min: 0,
      // As large as a field's text can be set.
      max: 300,
      step: 'any',
      value: props.fontSize ?? 0,
    });
    // The size as the page shows it: the keyboard's way to resize a field.
    const shown = designer.shownSize(field);
    const dimension = (value) =>
      el('input', {
        class: 'input',
        type: 'number',
        min: 4,
        step: 'any',
        value: Math.round(value * 100) / 100,
      });
    const size = shown && { width: dimension(shown.width), height: dimension(shown.height) };
    const sizeOf = () =>
      size && { width: Number(size.width.value), height: Number(size.height.value) };
    const specific = [];
    const read = {};
    if (field.type === 'text' || field.type === 'date') {
      const multiline = checkbox('field-multiline', '多行', props.multiline);
      const password = checkbox('field-password', '密码（字符隐藏）', props.password);
      const maxLength = el('input', {
        class: 'input',
        type: 'number',
        min: 1,
        step: 1,
        value: props.maxLength ?? '',
        placeholder: '无限制',
      });
      const alignment = selectInput(
        'field-alignment',
        [
          ['left', 'Left'],
          ['center', 'Center'],
          ['right', 'Right'],
        ],
        props.alignment || 'left',
      );
      const defaultValue = el('input', { class: 'input', value: props.defaultValue || '' });
      specific.push(
        labeled('field-default', '默认值', defaultValue),
        labeled('field-alignment', 'Alignment', alignment),
        labeled('field-maxlength', '字符数限制', maxLength),
        ...(field.type === 'text' ? [multiline.row, password.row] : []),
      );
      Object.assign(read, {
        defaultValue: () => defaultValue.value,
        alignment: () => alignment.value,
        maxLength: () => (maxLength.value ? Number(maxLength.value) : null),
        ...(field.type === 'text' && {
          multiline: () => multiline.box.checked,
          password: () => password.box.checked,
        }),
      });
    } else if (field.type === 'checkbox' || field.type === 'radio') {
      const exportValue = el('input', { class: 'input', value: props.exportValue || '' });
      const style = selectInput(
        'field-style',
        Object.keys(BUTTON_STYLES).map((key) => [key, key[0].toUpperCase() + key.slice(1)]),
        props.style || 'check',
      );
      const checked = checkbox('field-checked', '默认选中', props.checkedByDefault);
      specific.push(
        labeled('field-export', '导出值', exportValue),
        labeled('field-style', '选中样式', style),
        checked.row,
      );
      Object.assign(read, {
        exportValue: () => exportValue.value,
        style: () => style.value,
        checked: () => checked.box.checked,
        widgetIndex: () => field.widgetIndex,
      });
    } else if (field.type === 'dropdown' || field.type === 'listbox') {
      const options = el('textarea', {
        class: 'input',
        rows: 5,
        'aria-describedby': 'field-options-hint',
      });
      options.value = (props.options || []).map((option) => option.label ?? option).join('\n');
      const editable = checkbox('field-editable', '允许输入自定义值', props.editable);
      const multi = checkbox('field-multi', '允许多选', props.multiSelect);
      specific.push(
        labeled('field-options', '选项（每行一个）', options),
        field.type === 'dropdown' ? editable.row : multi.row,
      );
      Object.assign(read, {
        // A listed label keeps its own export value; a new line exports its label.
        options: () =>
          options.value
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map(
              (line) =>
                (props.options || []).find((option) => (option.label ?? option) === line) ?? line,
            ),
        ...(field.type === 'dropdown'
          ? { editable: () => editable.box.checked }
          : { multiSelect: () => multi.box.checked }),
      });
    } else if (field.type === 'button') {
      const label = el('input', { class: 'input', value: props.label || 'Button' });
      specific.push(labeled('field-label', 'Label', label));
      read.label = () => label.value;
    }
    const collect = () => ({
      name: nameInput.value.trim() || field.name,
      tooltip: tooltip.value,
      required: required.box.checked,
      readOnly: readOnly.box.checked,
      borderColor: noBorder.box.checked ? null : border.value,
      backgroundColor: noFill.box.checked ? null : fill.value,
      fontSize: Number(fontSize.value) || 0,
      ...Object.fromEntries(Object.entries(read).map(([key, value]) => [key, value()])),
    });
    // Only what was changed is written: an unchanged default value or "Checked by default"
    // would otherwise reset what was filled in, and a widget is a target, not a change.
    const initial = collect(),
      initialSize = JSON.stringify(sizeOf());
    const save = safe(async () => {
      // Save checks the values as Enter does, with the same messages.
      if (!form.reportValidity()) return;
      const next = Object.fromEntries(
        Object.entries(collect()).filter(
          ([key, value]) =>
            key === 'widgetIndex' || JSON.stringify(value) !== JSON.stringify(initial[key]),
        ),
      );
      const resized = JSON.stringify(sizeOf()) !== initialSize;
      // Nothing changed: no edit to record, and the document stays as it was saved.
      if (!resized && Object.keys(next).every((key) => key === 'widgetIndex')) return d.close();
      const rect = resized ? designer.resizedRect(field, sizeOf()) : null;
      await mutateDialog(
        d,
        async (doc) => {
          const renamed = await updateFormField(doc, field.name, next);
          let widgetIndex = field.widgetIndex;
          if (renamed !== field.name) {
            // A radio button named after another group joined it, after that group's buttons.
            const joined =
              field.type === 'radio'
                ? listFormFields(doc).findLast(
                    (entry) =>
                      entry.name === renamed &&
                      entry.page === field.page &&
                      ['x', 'y', 'width', 'height'].every(
                        (key) => entry.rect?.[key] === field.rect?.[key],
                      ),
                  )?.widgetIndex
                : undefined;
            designer.renamed(field.name, renamed, joined);
            widgetIndex = joined ?? widgetIndex;
          }
          if (rect) await moveFormWidget(doc, renamed, widgetIndex, rect);
          return renamed;
        },
        null,
        'edit',
      );
    });
    const remove = safe(async () => {
      designer.deleting(field);
      d.close();
      await removeFormField(field);
    });
    const form = el(
      'form',
      { class: 'stack' },
      labeled('field-name', 'Name', nameInput),
      labeled('field-tooltip', '工具提示（供读屏用户朗读）', tooltip),
      el('div', { class: 'field-grid' }, required.row, readOnly.row),
      ...specific,
      el(
        'div',
        { class: 'field-grid' },
        labeled('field-border', '边框颜色', border, noBorder.row),
        labeled('field-fill', '填充颜色', fill, noFill.row),
      ),
      labeled('field-size', '字号（0 表示适应框）', fontSize),
      size &&
        el(
          'div',
          { class: 'field-grid' },
          labeled('field-width', '宽度（pt）', size.width),
          labeled('field-height', '高度（pt）', size.height),
        ),
    );
    form.onsubmit = (e) => {
      e.preventDefault();
      save();
    };
    // A new field is already on the page: Done keeps it with whatever was set here.
    const d = modal(`${fieldTypeLabel(field.type)}属性`, form, [
      button('删除字段', 'Trash2', remove, 'btn danger'),
      ...(created
        ? [button('完成', null, save, 'btn primary')]
        : [button('取消', null, () => d.close()), button('保存', null, save, 'btn primary')]),
    ]);
    nameInput.select();
  }
  /** Find fields on a flat form and create the chosen ones, as automatic detection does. */
  async function detectFieldsDialog(version = dialogVersion()) {
    requireAccess('edit');
    const { addFormField, detectFormFields } = await loadForms();
    // A newer request, another dialog, or an edit meanwhile makes these findings stale.
    const revision = session.revision;
    const current = () => canOpenDialog(version) && session.revision === revision;
    const doc = await PDFDocument.load(session.bytes, { updateMetadata: false });
    const found = [];
    for (let page = 0; page < doc.getPageCount(); page++) {
      if (!current()) return;
      const textContent = await (await pdf.getPage(page + 1)).getTextContent();
      for (const candidate of detectFormFields(doc, page, { textContent }))
        found.push({ page, ...candidate });
    }
    if (!current()) return;
    if (!found.length) {
      toast('未发现新的表单字段。请使用表单工具手动添加字段。');
      return;
    }
    const list = el(
      'ul',
      { class: 'redact-results', 'aria-label': '发现的字段' },
      ...found.map((field, i) =>
        el(
          'li',
          {},
          el(
            'label',
            { class: 'result-row' },
            el('input', { type: 'checkbox', checked: field.confidence >= 0.5, 'data-index': i }),
            el(
              'span',
              {},
              `第 ${field.page + 1} 页：${fieldTypeLabel(field.type)} “${field.name || field.label || '无标题'}”`,
            ),
          ),
        ),
      ),
    );
    const create = safe(async () => {
      const chosen = [...list.querySelectorAll('input:checked')].map(
        (box) => found[Number(box.dataset.index)],
      );
      if (!chosen.length) throw new Error('请至少选择一个要创建的字段。');
      await mutateDialog(
        d,
        async (doc) => {
          for (const field of chosen)
            await addFormField(doc, field.page, {
              type: field.type,
              rect: field.rect,
              name: field.name || undefined,
              multiline: field.multiline || undefined,
            });
        },
        `已创建 ${chosen.length} 个字段。`,
        'edit',
      );
    });
    const d = modal(
      '发现表单字段',
      el(
        'div',
        { class: 'stack' },
        el(
          'p',
          { class: 'muted' },
          `在空白、线条和框线中发现了 ${found.length} 个可能的字段。请选择要创建的字段。`,
        ),
        list,
      ),
      [
        button('取消', null, () => d.close()),
        button('创建字段', null, create, 'btn primary'),
      ],
    );
  }
  /** Take out headers, footers, page numbers, or watermarks on every page. */
  async function removeMarks(kinds) {
    const { removePageMarks } = await import('./core/page-mark-removal.js');
    let removed = null;
    await mutate((doc) => {
      removed = removePageMarks(doc, doc.getPageIndices(), kinds);
      return removed ? undefined : false;
    }, null);
    // The PDF was not looked at when the edit was declined (a signed PDF asks first).
    if (removed === null || destroyed) return;
    const watermarks = kinds.includes('Watermark');
    toast(
      removed
        ? `Removed ${removed} ${watermarks ? 'watermark' : 'header or footer'}${removed === 1 ? '' : watermarks ? 's' : ' entries'}.`
        : `This PDF has no ${watermarks ? 'watermarks' : 'headers or footers'} to remove.`,
    );
  }
  /* ---------- Accessibility ---------- */
  let accessibilityChecked = false;
  async function runAccessibilityCheck({ open = true } = {}) {
    if (!pdf || destroyed) return;
    const { checkAccessibility } = await import('./core/accessibility.js');
    accessibilityReport.setBusy(true);
    try {
      const doc = await PDFDocument.load(session.bytes, { updateMetadata: false });
      if (destroyed) return;
      accessibilityReport.show(checkAccessibility(doc, { access: access() }));
      accessibilityChecked = true;
      sidebarTabs.querySelector('[data-tab="accessibility"]').hidden = false;
      if (open) {
        showSidebarTab('accessibility');
        if (editorRoot.classList.contains('hide-pages')) await toggleSidebar(true);
      }
    } finally {
      accessibilityReport.setBusy(false);
    }
  }
  /** Apply one of the report's fixes, asking for what it needs, then check again. */
  async function fixAccessibility(fix) {
    const a11y = await import('./core/accessibility.js');
    const { autotagDocument, tagAnnotations } = await import('./core/autotag.js');
    // A fix with nothing left to do changes nothing; it says so rather than nothing at all.
    const run = async (operation, message, unchanged) => {
      let result;
      await mutate(async (d) => (result = await operation(d)), message, 'edit');
      if (result === false && unchanged && !destroyed) toast(unchanged);
    };
    switch (fix) {
      case 'title': {
        const doc = await PDFDocument.load(session.bytes, { updateMetadata: false });
        // The title readers show, as Document details has it: the XMP one unless Info is newer.
        const { documentDetails } = await import('./core/details.js');
        const title = await promptText('文档标题', 'Title', documentDetails(doc).title);
        if (title == null) return;
        await run(
          (d) => a11y.setTitle(d, title),
          'Title set; readers will show it.',
          'PDF 已使用此标题。',
        );
        break;
      }
      case 'language': {
        // The language the PDF already declares comes first; the device's when it has none.
        const doc = await PDFDocument.load(session.bytes, { updateMetadata: false });
        const current = doc.catalog.lookup(PDFName.of('Lang'))?.decodeText?.().trim();
        const lang = await promptText(
          '文档语言',
          '语言（例如 zh-CN 或 en-US）',
          current || navigator.language || 'en-US',
        );
        if (lang == null) return;
        await run(
          (d) => a11y.setLanguage(d, lang.trim()),
          '语言已设置。',
          'PDF 已使用此语言。',
        );
        break;
      }
      case 'alt-text':
        await altTextDialog();
        break;
      case 'field-descriptions':
        await fieldDescriptionsDialog();
        break;
      case 'protection':
        await securityDialog();
        break;
      case 'tags':
        await run(
          (d) => autotagDocument(d, { lang: navigator.language || undefined }),
          'Tags added. Review the reading order and alternate text.',
        );
        break;
      case 'tag-annotations':
        await run(
          (d) => tagAnnotations(d),
          'Annotations tagged.',
          'No annotation is left untagged.',
        );
        break;
      case 'tab-order':
        await run(
          (d) => a11y.setTabOrder(d),
          'Tab order follows the document structure.',
          'The tab order already follows the document structure.',
        );
        break;
      case 'mark-info':
        await run(
          (d) => a11y.setMarked(d),
          'Marked as a tagged PDF.',
          'The PDF is already marked as tagged.',
        );
        break;
      case 'link-descriptions':
        await run(
          (d) => a11y.describeLinks(d),
          'Links described.',
          'No link is missing a description.',
        );
        break;
      case 'bookmarks':
        await run((d) => a11y.addBookmarksFromHeadings(d), 'Bookmarks added from the headings.');
        break;
      default:
        return;
    }
    if (!destroyed && accessibilityChecked) await runAccessibilityCheck();
  }
  /** Resolves once `dialog` has closed and the edit it saved, if any, is in place. */
  const dialogFinished = (dialog, saving) =>
    new Promise((resolve) =>
      dialog.addEventListener('close', () => resolve(saving()?.catch(() => {})), {
        once: true,
      }),
    );
  /** Alternate text for every figure the tags list. */
  async function altTextDialog() {
    const { listFigures, setFigureAltText } = await import('./core/accessibility.js');
    const doc = await PDFDocument.load(session.bytes, { updateMetadata: false });
    const figures = listFigures(doc);
    if (!figures.length) {
      toast('标签列表中没有图像。如果文档未标记，请先自动标记文档。');
      return;
    }
    const inputs = figures.map((figure, i) => {
      const input = el('textarea', {
        class: 'input',
        rows: 2,
        maxlength: 1000,
        placeholder: '为无法查看图片的人描述图片内容',
      });
      input.value = figure.alt || '';
      return input;
    });
    const save = safe(async () => {
      const changes = figures
        .map((figure, i) => [figure.ref, inputs[i].value.trim(), figure.alt || ''])
        .filter(([, value, before]) => value !== before);
      if (!changes.length) return d.close();
      saving = mutateDialog(
        d,
        (doc) => changes.forEach(([ref, value]) => setFigureAltText(doc, ref, value)),
        `Alternate text set for ${changes.length} ${changes.length === 1 ? 'figure' : 'figures'}.`,
      );
      await saving;
    });
    let saving = null;
    const d = modal(
      '替换文本',
      el(
        'div',
        { class: 'stack alt-text-list' },
        ...figures.map((figure, i) =>
          labeled(`alt-${i}`, `第 ${figure.page + 1} 页插图 ${i + 1}`, inputs[i]),
        ),
      ),
      [button('取消', null, () => d.close()), button('保存', null, save, 'btn primary')],
    );
    return dialogFinished(d, () => saving);
  }
  /** Tooltips that name each form field for screen reader users. */
  async function fieldDescriptionsDialog() {
    const { listFormFields } = await loadForms();
    const { setFieldDescriptions } = await import('./core/accessibility.js');
    const doc = await PDFDocument.load(session.bytes, { updateMetadata: false });
    const fields = [...new Map(listFormFields(doc).map((field) => [field.name, field])).values()];
    if (!fields.length) return toast('此 PDF 没有表单字段。');
    const inputs = fields.map((field) =>
      el('input', { class: 'input', value: field.props?.tooltip || '', maxlength: 300 }),
    );
    const save = safe(async () => {
      const descriptions = Object.fromEntries(
        fields
          .map((field, i) => [field.name, inputs[i].value.trim(), field.props?.tooltip || ''])
          .filter(([, value, before]) => value !== before)
          .map(([fieldName, value]) => [fieldName, value]),
      );
      if (!Object.keys(descriptions).length) return d.close();
      saving = mutateDialog(
        d,
        (doc) => setFieldDescriptions(doc, descriptions),
        '已保存字段说明。',
      );
      await saving;
    });
    let saving = null;
    const d = modal(
      '字段说明',
      el(
        'div',
        { class: 'stack' },
        ...fields.map((field, i) => labeled(`field-tip-${i}`, field.name, inputs[i])),
      ),
      [button('取消', null, () => d.close()), button('保存', null, save, 'btn primary')],
    );
    return dialogFinished(d, () => saving);
  }
  /* ---------- PDF standards ---------- */
  function showStandardsBar() {
    standardsBar.hidden = !pdfaClaim;
    if (pdfaClaim)
      standardsText.textContent = `此文件声明符合 PDF/A-${pdfaClaim.part}${pdfaClaim.conformance} 标准。仅当编辑后的结果仍符合规范时，该声明才有效。`;
  }
  /** Check against a PDF/A level, or convert to it, and show what is left to fix. */
  async function pdfaDialog(mode = 'check') {
    const { PDFA_LEVELS } = await import('./core/pdfa.js');
    const levelSelect = selectInput(
      'pdfa-level',
      PDFA_LEVELS.map((entry) => [`${entry.part}${entry.conformance}`, entry.label]),
      pdfaClaim ? `${pdfaClaim.part}${pdfaClaim.conformance}` : '2b',
    );
    const run = safe(async () => {
      const [part, conformance] = [Number(levelSelect.value[0]), levelSelect.value[1]];
      d.close();
      if (mode === 'check') await preflight(part, conformance);
      else await convertPdfA(part, conformance);
    });
    const d = modal(
      mode === 'check' ? '检查 PDF/A 合规性' : '另存为 PDF/A',
      el(
        'div',
        { class: 'stack' },
        el(
          'p',
          { class: 'muted' },
          mode === 'check'
            ? '对照 PDF/A 标准级别进行预检并列出不合规项。'
            : '自动修复可自动处理的内容（颜色配置文件、元数据、标准 14 种字体、脚本、批注外观）并报告剩余问题。PDF/A 不允许使用密码保护。',
        ),
        labeled('pdfa-level', '标准级别', levelSelect),
      ),
      [
        button('取消', null, () => d.close()),
        button(mode === 'check' ? '检查' : '转换', null, run, 'btn primary'),
      ],
    );
  }
  function showPdfaReport(title, report, fixed = []) {
    const issues = report.issues || report.remaining || [];
    const list = el(
      'ul',
      { class: 'pdfa-issues' },
      ...issues.map((issue) =>
        el(
          'li',
          { class: `pdfa-${issue.severity}` },
          el('span', { class: 'pdfa-rule muted' }, issue.rule || ''),
          el(
            'span',
            {},
            `${issue.message}${issue.count > 1 ? ` (${issue.count})` : ''}${Number.isInteger(issue.page) ? ` — 第 ${issue.page} 页` : ''}`,
          ),
        ),
      ),
    );
    const d = modal(
      title,
      el(
        'div',
        { class: 'stack' },
        el(
          'p',
          {},
          report.compliant
            ? '此级别未发现问题。'
            : `仍有 ${issues.length} 个问题。`,
        ),
        fixed.length > 0 &&
          el(
            'details',
            { open: true },
            el('summary', {}, `已修复 (${fixed.length})`),
            el(
              'ul',
              {},
              ...fixed.map((item) =>
                el('li', {}, `${item.message}${item.count > 1 ? ` (${item.count})` : ''}`),
              ),
            ),
          ),
        issues.length ? list : null,
        el(
          'p',
          { class: 'muted' },
          '此检查涵盖实践中最重要的 PDF/A 规则；专用验证器可检查全部条款。',
        ),
      ),
      [button('关闭', null, () => d.close(), 'btn primary')],
    );
  }
  async function preflight(part, conformance) {
    const { preflightPdfA } = await import('./core/pdfa.js');
    const doc = await PDFDocument.load(session.bytes, { updateMetadata: false });
    const report = preflightPdfA(doc, { part, conformance, bytes: session.bytes });
    showPdfaReport(`PDF/A-${part}${conformance} 检查`, report);
  }
  async function convertPdfA(part, conformance) {
    requireAccess('edit');
    if (protection) throw new Error('请先移除密码：PDF/A 文件不能加密。');
    const { convertToPdfA, pdfaIdentification } = await import('./core/pdfa.js');
    let result = null;
    const previous = pdfaClaim;
    pdfaClaim = { part, conformance };
    try {
      await mutate(async (doc) => {
        result = await convertToPdfA(doc, { part, conformance });
      }, null);
    } catch (error) {
      pdfaClaim = previous;
      throw error;
    }
    // Declined (a signed PDF asks first) or not run: the file claims what it did before.
    if (!result) pdfaClaim = previous;
    if (!result || destroyed) return;
    const doc = await PDFDocument.load(session.bytes, { updateMetadata: false });
    pdfaClaim = pdfaIdentification(doc);
    showStandardsBar();
    showPdfaReport(`已另存为 PDF/A-${part}${conformance}`, result, result.fixed);
  }
  /* ---------- Compare files ---------- */
  let comparison = null; // { view, tasks }
  /** Compare this PDF with another version, side by side with every change listed. */
  function compareDialog() {
    if (!pdf) return;
    let chosen = null;
    const fileName = el('span', { class: 'muted' }, '未选择文件');
    const newer = el('input', { type: 'checkbox', id: 'compare-newer' });
    const choose = () => {
      const input = el('input', { type: 'file', accept: '.pdf,application/pdf' });
      input.onchange = safe(async () => {
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > MAX_FILE_SIZE) throw new Error('请选择小于 100 MB 的 PDF 文件。');
        let bytes = new Uint8Array(await file.arrayBuffer());
        const source = await validatePdf(bytes).catch((error) => {
          if (error.code !== 'encrypted') throw error;
          return null;
        });
        if (!source) {
          const unlocked = await promptUnlock(bytes, file.name, dialogOptions);
          if (!unlocked) return;
          bytes = unlocked.bytes;
        }
        chosen = { name: file.name, bytes };
        fileName.textContent = file.name;
        compareButton.disabled = false;
      });
      input.click();
    };
    const run = safe(async () => {
      if (!chosen) throw new Error('请选择另一个版本的 PDF。');
      d.close();
      await runCompare(chosen, { currentIsNew: newer.checked });
    });
    const compareButton = button('比较', null, run, 'btn primary', { disabled: true });
    const d = modal(
      '比较文件',
      el(
        'div',
        { class: 'stack' },
        el(
          'p',
          { class: 'muted' },
          `将“${name}”与另一个版本进行比较。并排显示插入、删除或替换的文本、格式更改、图片以及添加、删除或移动的页面。`,
        ),
        el(
          'div',
          { class: 'field-inline' },
          button('选择文件…', 'FolderOpen', choose, 'btn'),
          fileName,
        ),
        el(
          'label',
          { class: 'checkbox-row', for: 'compare-newer' },
          el('span', {}, `${name} 是较新版本`),
          newer,
        ),
      ),
      [button('取消', null, () => d.close()), compareButton],
    );
  }
  async function runCompare(other, { currentIsNew = false } = {}) {
    if (busy || destroyed || !pdf) return;
    const { compareDocuments } = await import('./core/compare.js');
    const { createCompareView, pageFingerprint } = await import('./compare-view.js');
    closeComparison();
    busy = true;
    updateStatus();
    const controller = new AbortController();
    const bar = el('progress', { max: 1, value: 0, 'aria-label': '比对进度' });
    const progress = el('p', { class: 'muted', role: 'status' }, '正在读取两个版本…');
    const d = modal('正在比较', el('div', { class: 'stack' }, progress, bar), [
      button('取消', null, () => controller.abort()),
    ]);
    let done = false;
    d.addEventListener('close', () => {
      if (!done) controller.abort();
    });
    const task = loadPdf(other.bytes.slice());
    // The view keeps its own copy of this PDF: an edit made while it is open replaces the
    // editor's document, and the pages compared must still draw.
    const ownTask = loadPdf(session.bytes.slice());
    const tasks = [task, ownTask];
    try {
      const [otherPdf, ownPdf] = await Promise.all(tasks.map((t) => t.promise));
      const [oldPdf, newPdf] = currentIsNew ? [otherPdf, ownPdf] : [ownPdf, otherPdf];
      const [oldName, newName] = currentIsNew ? [other.name, name] : [name, other.name];
      const result = await compareDocuments(oldPdf, newPdf, {
        signal: controller.signal,
        renderPage: pageFingerprint,
        onProgress: ({ phase, done: finished, total }) => {
          bar.value = total ? (phase === 'read' ? 0.9 : 1) * (finished / total) : 0;
          progress.textContent =
            phase === 'read' ? `正在读取页面（${finished} / ${total}）…` : '正在比对…';
        },
      });
      done = true;
      if (d.open) d.close();
      if (destroyed) {
        for (const t of tasks) t.destroy().catch(() => {});
        return;
      }
      const view = createCompareView({
        oldPdf,
        newPdf,
        oldName,
        newName,
        result,
        onClose: () => closeComparison(),
      });
      comparison = { view, tasks };
      // The comparison takes the page area, as Organize pages does; one of them at a time.
      closeOrganizer();
      editorRoot.querySelector('.document-view').append(view.root);
      editorRoot.classList.add('comparing');
      view.focus();
    } catch (error) {
      for (const t of tasks) t.destroy().catch(() => {});
      if (!['AbortError', 'RenderingCancelledException'].includes(error?.name)) throw error;
    } finally {
      done = true;
      if (d.open) d.close();
      busy = false;
      updateStatus();
    }
  }
  function closeComparison() {
    if (!comparison) return;
    const { view, tasks } = comparison;
    comparison = null;
    view.destroy();
    view.root.remove();
    for (const task of tasks) task.destroy().catch(() => {});
    editorRoot.classList.remove('comparing');
    workspace.focus({ preventScroll: true });
  }
  /** The empty PDF the app opened with, still empty: not a file to combine or process. */
  const untouchedBlank = () => blank && session.revision === 0 && !protection;
  /* ---------- Batch processing ---------- */
  /**
   * Apply one list of steps to several PDFs, as an action wizard does, and download the
   * results together in a ZIP. This PDF can be one of them, as it is now.
   */
  async function batchDialog() {
    const { BATCH_STEPS: BATCH_STEP_LABELS } = await import('./core/batch.js');
    const files = [];
    const includeCurrent = el('input', {
      type: 'checkbox',
      id: 'batch-current',
      checked: !untouchedBlank(),
    });
    const list = el('ul', { class: 'combine-list', 'aria-label': '要处理的文件' });
    const renderFiles = () =>
      list.replaceChildren(
        ...files.map((file, i) =>
          el(
            'li',
            { class: 'combine-row' },
            el('span', { class: 'combine-name', title: file.name }, file.name),
            iconButton(`移除 ${file.name}`, 'Trash2', () => {
              files.splice(i, 1);
              renderFiles();
              // The pressed button is gone; the file that takes its place, the one before it,
              // or Add PDFs keeps the keyboard focus in the dialog.
              const buttons = list.querySelectorAll('button');
              (buttons[Math.min(i, buttons.length - 1)] || addButton).focus();
            }),
          ),
        ),
      );
    const addFiles = () => {
      const input = el('input', { type: 'file', multiple: true, accept: '.pdf,application/pdf' });
      input.onchange = safe(async () => {
        // A file that cannot be added stops the rest, but those already added are listed.
        try {
          for (const file of input.files) {
            if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name} 大小超过 100 MB。`);
            files.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
          }
        } finally {
          renderFiles();
        }
      });
      input.click();
    };
    // Each step's setting, labelled by the step's own row.
    const controls = {
      rotate: selectInput(
        'batch-rotate-degrees',
        [
          ['90', '顺时针 90°'],
          ['270', '逆时针 90°'],
          ['180', '旋转 180°'],
        ],
        '90',
      ),
      watermark: el('input', {
        id: 'batch-watermark-text',
        class: 'input',
        value: '机密文件',
        maxlength: 200,
        'aria-label': '水印文本',
      }),
      pageNumbers: selectInput(
        'batch-numbers-format',
        Object.entries(NUMBER_FORMATS).map(([key, value]) => [
          key,
          value.replace('{n}', '1').replace('{N}', '9'),
        ]),
        'of',
      ),
      bates: el('input', {
        id: 'batch-bates-prefix',
        class: 'input',
        placeholder: '前缀，例如 ABC',
        maxlength: 40,
        'aria-label': '贝茨前缀',
      }),
      compress: selectInput(
        'batch-compress-level',
        Object.entries(COMPRESSION_LEVELS).map(([key, level]) => [key, level.label]),
        'balanced',
      ),
      protect: el('input', {
        id: 'batch-protect-password',
        class: 'input',
        type: 'password',
        autocomplete: 'new-password',
        placeholder: '打开密码',
        'aria-label': '已处理文件的密码',
      }),
    };
    controls.rotate.setAttribute('aria-label', '旋转角度');
    controls.pageNumbers.setAttribute('aria-label', '页码格式');
    controls.compress.setAttribute('aria-label', '压缩级别');
    const steps = Object.entries(BATCH_STEP_LABELS).map(([type, label]) => ({
      type,
      box: el('input', { type: 'checkbox', id: `batch-step-${type}` }),
      label,
    }));
    // Setting a step's option means the step is wanted, as typing a split point chooses that
    // way of splitting; otherwise a changed option was left out of the run without a word.
    for (const step of steps)
      for (const event of ['input', 'change'])
        controls[step.type]?.addEventListener(event, () => (step.box.checked = true));
    const stepRows = steps.map((step) =>
      el(
        'div',
        { class: 'batch-step' },
        el(
          'label',
          { class: 'checkbox-row', for: step.box.id },
          el('span', {}, step.label),
          step.box,
        ),
        controls[step.type] && el('div', { class: 'batch-option' }, controls[step.type]),
      ),
    );
    const run = safe(async () => {
      const chosen = steps
        .filter((step) => step.box.checked)
        .map((step) => {
          const value = controls[step.type]?.value;
          switch (step.type) {
            case 'rotate':
              return { type: 'rotate', degrees: Number(value) };
            case 'watermark':
              // Said here, while the dialog is open, rather than once per file afterwards.
              if (!value.trim()) throw new Error('请输入水印文本。');
              return { type: 'watermark', text: value };
            case 'pageNumbers':
              return { type: 'pageNumbers', format: value, position: 'bottom-center' };
            case 'bates':
              return {
                type: 'bates',
                prefix: value,
                start: 1,
                digits: 6,
                position: 'bottom-right',
              };
            case 'compress':
              return { type: 'compress', level: value };
            case 'protect':
              if (!value) throw new Error('请输入受保护文件的密码。');
              return { type: 'protect', open: value };
            default:
              return { type: step.type };
          }
        });
      const inputs = [
        ...(includeCurrent.checked ? [{ name, bytes: session.bytes.slice(), protection }] : []),
        ...files,
      ];
      // Checked while the dialog is open, so the files and steps chosen are still there.
      if (!inputs.length) throw new Error('请添加至少一个 PDF。');
      if (!chosen.length) throw new Error('请至少选择一个处理步骤。');
      if (includeCurrent.checked) requireAccess('copy');
      d.close();
      await runBatchSteps(inputs, chosen);
    });
    const addButton = button('添加 PDF…', 'Plus', addFiles, 'btn');
    const d = modal(
      '批量处理',
      el(
        'div',
        { class: 'stack batch-dialog' },
        el(
          'p',
          { class: 'muted' },
          '对多个 PDF 应用相同的步骤。处理结果将一起下载。',
        ),
        el(
          'label',
          { class: 'checkbox-row', for: 'batch-current' },
          el('span', {}, `包含 ${name}`),
          includeCurrent,
        ),
        addButton,
        list,
        el('h3', { class: 'batch-heading' }, '按此顺序执行步骤'),
        ...stepRows,
      ),
      [button('取消', null, () => d.close()), button('开始处理', null, run, 'btn primary')],
    );
  }
  async function runBatchSteps(inputs, steps) {
    if (busy || destroyed) return;
    const { runBatch } = await import('./core/batch.js');
    busy = true;
    updateStatus();
    const controller = new AbortController();
    const progress = el('p', { class: 'muted', role: 'status' }, '正在启动…');
    const bar = el('progress', { max: inputs.length, value: 0, 'aria-label': '批量处理进度' });
    const d = modal('正在处理文件', el('div', { class: 'stack' }, progress, bar), [
      button('取消', null, () => controller.abort()),
    ]);
    let done = false;
    d.addEventListener('close', () => {
      if (!done) controller.abort();
    });
    const opened = new Map();
    try {
      const results = await runBatch(inputs, steps, {
        signal: controller.signal,
        codec: createImageCodec(loadPdf),
        onProgress: ({ file, step, index, files }) => {
          bar.value = index;
          progress.textContent = `${file} (${index + 1} of ${files}): ${step}…`;
        },
        recognize: async (bytes, page, { pageNeedsOcr }) => {
          let task = opened.get(bytes);
          if (!task) {
            // Files are recognized one after another; let the last one go before reading the
            // next, so a long batch does not hold every PDF in memory until it ends.
            for (const old of opened.values()) old.destroy().catch(() => {});
            opened.clear();
            opened.set(bytes, (task = loadPdf(bytes.slice())));
          }
          const doc = await task.promise;
          const pdfPage = await doc.getPage(page + 1);
          const content = await pdfPage.getTextContent({ includeMarkedContent: true });
          if (!pageNeedsOcr(content, userArea(pdfPage))) return null;
          const { createOcrEngine } = await import('./ocr-engine.js');
          ocrEngine ??= createOcrEngine();
          const picture = await pageImage(doc, page, {
            dpi: 300,
            type: 'image/png',
            signal: controller.signal,
            annotations: false,
          });
          return ocrEngine.recognize(picture, { signal: controller.signal });
        },
      });
      // The open PDF is worked on without its password. Its copy is locked again as every other
      // export of it is, unless the batch gives the results a password of its own.
      if (!steps.some((step) => step.type === 'protect'))
        for (const [i, result] of results.entries()) {
          if (!result.bytes || !inputs[i].protection) continue;
          try {
            result.bytes = await exportBytes(result.bytes, inputs[i].protection);
          } catch (error) {
            results[i] = { name: result.name, error: error.message };
          }
        }
      done = true;
      if (d.open) d.close();
      if (destroyed) return;
      const good = results.filter((result) => result.bytes);
      const failed = results.filter((result) => result.error);
      if (good.length) {
        const used = new Set();
        const parts = good.map((result) => {
          let fileName = `${safeName(result.name).replace(/\.pdf$/i, '')} processed.pdf`;
          for (let n = 2; used.has(fileName); n++)
            fileName = fileName.replace(/( \(\d+\))?\.pdf$/, ` (${n}).pdf`);
          used.add(fileName);
          return { name: fileName, bytes: result.bytes };
        });
        if (parts.length === 1) download(parts[0].bytes, parts[0].name);
        else download(new Blob(zipParts(parts), { type: 'application/zip' }), 'Processed PDFs.zip');
      }
      const summary = failed.length
        ? `${good.length} processed; ${failed.length} could not be: ${failed.map((f) => `${f.name} (${f.error})`).join('; ')}`
        : `${good.length} ${good.length === 1 ? 'file' : 'files'} processed.`;
      const warnings = good.flatMap((result) =>
        (result.warnings || []).map((warning) => `${result.name}: ${warning}`),
      );
      if (!warnings.length) {
        toast(summary, { error: failed.length > 0 && !good.length });
        return;
      }
      // Content a step could not read was left in the file; that must not pass by in a brief
      // message, as Remove hidden information on one PDF says too.
      const notice = modal(
        '检查已处理的 PDF',
        el(
          'div',
          { class: 'stack' },
          el('p', {}, summary),
          el('p', {}, '部分操作未完全按预期完成。在分享文件之前请检查以下内容：'),
          el('ul', {}, ...warnings.map((warning) => el('li', {}, warning))),
        ),
        [button('确定', null, () => notice.close(), 'btn primary')],
      );
    } catch (error) {
      if (!['AbortError', 'RenderingCancelledException'].includes(error?.name)) throw error;
    } finally {
      done = true;
      if (d.open) d.close();
      for (const task of opened.values()) task.destroy().catch(() => {});
      busy = false;
      updateStatus();
    }
  }
  /* ---------- Read out loud ---------- */
  // The browser's own speech voices read the page text, page after page when asked.
  let reading = null; // { generation, toEnd }
  const canSpeak = () => !!globalThis.speechSynthesis && access().accessibility;
  async function pageWords(index) {
    const page = await pdf.getPage(index + 1);
    return pageSpeechText((await page.getTextContent()).items);
  }
  async function readAloud(toEnd = false) {
    if (!canSpeak()) throw new Error('此处无法使用朗读功能。');
    stopReading();
    const generation = Symbol('reading');
    reading = { generation, toEnd };
    // The voice follows the language the PDF says it is written in, not the app's own; an
    // English voice reading French words mispronounces nearly all of them.
    let lang = document.documentElement.lang || 'en';
    try {
      const { info } = await pdf.getMetadata();
      lang = Intl.getCanonicalLocales(info.Language.trim())[0] || lang;
    } catch {
      // No language, or a malformed one: the app's own language reads it.
    }
    if (reading?.generation !== generation || destroyed) return;
    let spoken = false;
    for (let index = pageIndex; index < pageCount; index++) {
      const text = await pageWords(index);
      if (reading?.generation !== generation || destroyed) return;
      if (index !== pageIndex) await navigate(index);
      for (const chunk of speechChunks(text, { lang })) {
        if (reading?.generation !== generation || destroyed) return;
        spoken = true;
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.lang = lang;
        await new Promise((resolve) => {
          utterance.onend = utterance.onerror = resolve;
          speechSynthesis.speak(utterance);
        });
      }
      if (!toEnd || reading?.generation !== generation) break;
    }
    if (reading?.generation !== generation) return;
    reading = null;
    // Scanned pages are pictures of text; there is nothing to read until it is recognized.
    if (!spoken)
      toast(
        `${toEnd ? 'The pages from here to the end have' : 'This page has'} no text to read. Scanned pages need Scan & OCR first.`,
      );
  }
  function stopReading() {
    reading = null;
    // Chrome stays paused through cancel(), and would never speak the next reading; resuming
    // first, while the paused words are still queued, lets cancel() end them.
    if (globalThis.speechSynthesis?.paused) speechSynthesis.resume();
    globalThis.speechSynthesis?.cancel();
  }
  function readingItems() {
    const speaking = !!reading;
    return [
      {
        label: '朗读此页',
        icon: 'BookOpen',
        disabled: !pdf || !canSpeak(),
        onSelect: safe(() => readAloud(false)),
      },
      {
        label: '朗读到文档末尾',
        disabled: !pdf || !canSpeak(),
        onSelect: safe(() => readAloud(true)),
      },
      {
        label: globalThis.speechSynthesis?.paused ? 'Resume' : 'Pause',
        disabled: !speaking,
        onSelect: () =>
          speechSynthesis.paused ? speechSynthesis.resume() : speechSynthesis.pause(),
      },
      { label: 'Stop', disabled: !speaking, onSelect: () => stopReading() },
    ];
  }
  /* ---------- Scan & OCR ---------- */
  // One recognition engine per editor, started on first use and stopped with the editor.
  let ocrEngine = null;
  /** Recognize text on scanned pages and add it as an invisible, searchable text layer. */
  function ocrDialog() {
    requireAccess('edit');
    if (!pdf) return;
    const choices = pageChoices('ocr-pages', pdf.numPages, { all: true });
    const skip = el('input', { type: 'checkbox', id: 'ocr-skip', checked: true });
    const dpi = selectInput(
      'ocr-dpi',
      [
        ['200', '200 dpi (faster)'],
        ['300', '300 dpi (recommended)'],
        ['400', '400 dpi (small print)'],
      ],
      '300',
    );
    const form = el(
      'form',
      { class: 'stack' },
      el(
        'p',
        { class: 'muted' },
        'Text found in scanned pages becomes selectable and searchable. The pages look the same; recognition runs on this device. Language: English.',
      ),
      el(
        'label',
        { class: 'checkbox-row', for: 'ocr-skip' },
        el('span', {}, '跳过已有文本的页面'),
        skip,
      ),
      el('div', { class: 'field-grid' }, labeled('ocr-dpi', 'Resolution', dpi)),
      el('p', { class: 'muted' }, '页面'),
      choices.list,
    );
    const apply = safe(async () => {
      const pages = [...new Set(choices.indices())].sort((a, b) => a - b);
      d.close();
      await recognizeText(pages, { skipText: skip.checked, dpi: Number(dpi.value) });
    });
    form.onsubmit = (e) => {
      e.preventDefault();
      apply();
    };
    const d = modal('识别文本', form, [
      button('取消', null, () => d.close()),
      button('识别文本', null, apply, 'btn primary'),
    ]);
  }
  async function recognizeText(pages, { skipText = true, dpi = 300 } = {}) {
    requireAccess('edit');
    if (busy || destroyed || !pdf) return;
    if (!(await confirmSignedEdit())) return;
    busy = true;
    updateStatus();
    const controller = new AbortController();
    const bar = el('progress', { max: 1, value: 0, 'aria-label': '识别进度' });
    const progress = el('p', { class: 'muted', role: 'status' }, '正在启动文本识别…');
    const d = modal('正在识别文本', el('div', { class: 'stack' }, progress, bar), [
      button('取消', null, () => controller.abort()),
    ]);
    let done = false;
    d.addEventListener('close', () => {
      if (!done) controller.abort();
    });
    const thisPdf = pdf;
    const results = [];
    let skipped = 0;
    try {
      const { createOcrEngine } = await import('./ocr-engine.js');
      const { pageNeedsOcr, addOcrTextLayer } = await import('./core/ocr.js');
      ocrEngine ??= createOcrEngine();
      for (const [k, index] of pages.entries()) {
        controller.signal.throwIfAborted();
        const page = await thisPdf.getPage(index + 1);
        if (skipText) {
          const content = await page.getTextContent({ includeMarkedContent: true });
          if (!pageNeedsOcr(content, userArea(page))) {
            skipped++;
            continue;
          }
        }
        progress.textContent = `正在识别第 ${index + 1} 页（共 ${pages.length} 页中的第 ${k + 1} 页）…`;
        // Only the page is read: the words of comments and form fields are not part of the
        // scan, and would stay behind as page text after they change or are removed.
        const picture = await pageImage(thisPdf, index, {
          dpi,
          type: 'image/png',
          signal: controller.signal,
          annotations: false,
        });
        const result = await ocrEngine.recognize(picture, {
          signal: controller.signal,
          onProgress: (fraction) => {
            bar.value = (k + fraction) / pages.length;
          },
        });
        if (result.words.length) results.push({ index, result });
        bar.value = (k + 1) / pages.length;
      }
      controller.signal.throwIfAborted();
      done = true;
      if (d.open) d.close();
      if (destroyed) return;
      if (!results.length) {
        toast(
          skipped === pages.length
            ? '这些页面已包含文本，因此无需识别。'
            : '在这些页面上未找到文本。',
        );
        return;
      }
      const words = results.reduce((sum, entry) => sum + entry.result.words.length, 0);
      busy = false;
      await mutate(
        async (doc) => {
          for (const { index, result } of results) await addOcrTextLayer(doc, index, result);
        },
        `在 ${results.length} 个页面上识别了 ${words.toLocaleString()} 个字词。现在可以对文本进行搜索和选择了。`,
      );
    } catch (error) {
      if (!['AbortError', 'RenderingCancelledException'].includes(error?.name)) throw error;
    } finally {
      done = true;
      if (d.open) d.close();
      busy = false;
      updateStatus();
    }
  }
  /** Remove text layers this app added by recognition. */
  async function removeRecognizedText() {
    requireAccess('edit');
    const { removeOcrTextLayer } = await import('./core/ocr.js');
    let removed = 0;
    await mutate((doc) => {
      for (let i = 0; i < doc.getPageCount(); i++) if (removeOcrTextLayer(doc, i)) removed++;
      return removed ? undefined : false;
    }, null);
    toast(
      removed
        ? `已从 ${removed} 个页面中移除识别文本。`
        : '此 PDF 中没有在此处识别的文本。',
    );
  }
  /** Export to an Office or text format: choose the pages (and slide pictures for PPTX). */
  function officeExportDialog(format) {
    requireAccess('copy');
    if (!pdf) return;
    const labels = {
      docx: 'Microsoft Word 文档',
      xlsx: '电子表格',
      pptx: '演示文稿',
      txt: '纯文本',
      html: '网页',
      rtf: '富文本',
    };
    const choices = pageChoices('office-pages', pdf.numPages, { all: true });
    const backgrounds = el('input', { type: 'checkbox', id: 'office-backgrounds' });
    const singleSheet = el('input', { type: 'checkbox', id: 'office-single-sheet' });
    const form = el(
      'form',
      { class: 'stack' },
      el(
        'p',
        { class: 'muted' },
        {
          docx: '文本将转为可编辑的段落、标题、列表和表格，并保留图片位置。',
          xlsx: '表格和对齐的文本将转为工作表单元格，每页对应一个工作表；数字、货币和日期保留为数值。',
          pptx: '每页将转为幻灯片，文本位于可编辑框中并保留图片位置。',
          txt: '按阅读顺序排列的每页纯文本。',
          html: '作为包含标题、段落、列表、表格和图片的网页。',
          rtf: '大多数文字处理软件均可打开的格式化文本。',
        }[format],
      ),
      format === 'pptx' &&
        el(
          'label',
          { class: 'checkbox-row', for: 'office-backgrounds' },
          el('span', {}, '在每张幻灯片后放置页面背景图片（保留绘图和图表）'),
          backgrounds,
        ),
      format === 'xlsx' &&
        el(
          'label',
          { class: 'checkbox-row', for: 'office-single-sheet' },
          el('span', {}, '将所有页面放入单个工作表中'),
          singleSheet,
        ),
      el('p', { class: 'muted' }, '页面'),
      choices.list,
    );
    const apply = safe(async () => {
      const pages = [...new Set(choices.indices())].sort((a, b) => a - b);
      d.close();
      await runOfficeExport(format, pages, {
        slideBackgrounds: backgrounds.checked,
        singleSheet: singleSheet.checked,
        label: labels[format],
      });
    });
    form.onsubmit = (e) => {
      e.preventDefault();
      apply();
    };
    const d = modal(`导出为 ${labels[format]}`, form, [
      button('取消', null, () => d.close()),
      button('导出', 'Download', apply, 'btn primary'),
    ]);
  }
  async function runOfficeExport(format, pages, { slideBackgrounds, singleSheet, label }) {
    requireAccess('copy');
    if (busy || destroyed || !pdf) return;
    busy = true;
    updateStatus();
    const controller = new AbortController();
    const bar = el('progress', { max: 1, value: 0, 'aria-label': '导出进度' });
    const progress = el('p', { class: 'muted', role: 'status' }, '正在读取页面…');
    const d = modal(`正在导出为 ${label}`, el('div', { class: 'stack' }, progress, bar), [
      button('取消', null, () => controller.abort()),
    ]);
    let done = false;
    d.addEventListener('close', () => {
      if (!done) controller.abort();
    });
    const thisPdf = pdf;
    try {
      const { exportDocument } = await import('./core/export-office.js');
      const { documentDetails } = await import('./core/details.js');
      const details = documentDetails(
        await PDFDocument.load(session.bytes, { updateMetadata: false }),
        session.bytes,
      );
      const result = await exportDocument(thisPdf, session.bytes, format, {
        // Layers turned off in the Layers panel are left out, as they are on screen.
        layers: documentLayers || undefined,
        pages,
        signal: controller.signal,
        slideBackgrounds,
        singleSheet,
        title: details.title || name.replace(/\.pdf$/i, ''),
        author: details.author || '',
        onProgress: (finished, total) => {
          bar.value = total ? finished / total : 0;
          // The steps are the pages, then any slide pictures, then writing the file.
          const count = pages.length;
          progress.textContent =
            finished < count
              ? `正在处理第 ${finished + 1} 页（共 ${count} 页）…`
              : finished < total - 1
                ? `正在绘制幻灯片 ${finished - count + 1}（共 ${count} 张）…`
                : '正在写入文件…';
        },
        renderPage: async (index, scale = 2) =>
          new Uint8Array(
            await (
              await pageImage(thisPdf, index, {
                dpi: 72 * scale,
                type: 'image/png',
                signal: controller.signal,
              })
            ).arrayBuffer(),
          ),
      });
      controller.signal.throwIfAborted();
      if (destroyed) return;
      done = true;
      const base = safeName(name).replace(/\.pdf$/i, '');
      download(
        result.blob || new Blob([result.bytes], { type: result.mime }),
        `${base}.${result.extension}`,
        result.mime,
      );
      toast(`已导出为 ${label}。`);
    } catch (error) {
      if (!['AbortError', 'RenderingCancelledException'].includes(error?.name)) throw error;
    } finally {
      done = true;
      if (d.open) d.close();
      busy = false;
      updateStatus();
    }
  }
  /** Download the PDF as several files in one ZIP. */
  function splitDialog() {
    requireAccess('copy');
    if (!pdf) return;
    // The tools pane offers Split whatever the length; the menus disable it instead.
    if (pdf.numPages < 2)
      throw new Error('此 PDF 只有一页，无需拆分。');
    const count = pdf.numPages;
    const every = el('input', {
      type: 'number',
      class: 'input count-input',
      min: 1,
      max: count - 1,
      step: 1,
      value: Math.max(Math.min(count - 1, 2), Math.ceil(count / MAX_SPLIT_FILES)),
      'aria-label': '每份页数',
      inputmode: 'numeric',
    });
    const points = el('input', {
      type: 'text',
      class: 'input',
      placeholder: '例如：3, 7',
      'aria-label': '新分卷起始页码',
      inputmode: 'numeric',
      autocomplete: 'off',
    });
    const choice = (value, label, checked, control) =>
      el(
        'div',
        { class: control ? 'choice-with-input' : undefined },
        el(
          'label',
          { class: 'choice-row' },
          el('input', { type: 'radio', name: 'split-mode', value, checked }),
          el('span', {}, label),
        ),
        control,
      );
    const list = el(
      'div',
      { class: 'choice-list', role: 'radiogroup', 'aria-label': '拆分方式' },
      choice('each', `每页拆分为单独的 PDF（共 ${count} 个文件）`, count <= MAX_SPLIT_FILES),
      // "Every 2 pages": the number alone did not say what it counts.
      choice('every', '每', count > MAX_SPLIT_FILES, [
        every,
        el('span', { 'aria-hidden': 'true' }, '页'),
      ]),
      choice('at', '在指定页之前拆分为新部分', false, points),
    );
    for (const [input, value] of [
      [every, 'every'],
      [points, 'at'],
    ])
      input.addEventListener('input', () => {
        list.querySelector(`input[value="${value}"]`).checked = true;
        preview();
      });
    list.addEventListener('change', preview);
    const summary = el('p', { class: 'muted', role: 'status' });
    const plan = () => {
      const mode = list.querySelector('input:checked')?.value || 'each';
      const ranges = splitRanges(count, {
        mode,
        every: Number(every.value),
        at: mode === 'at' ? parseSplitPoints(points.value, count) : [],
      });
      if (ranges.length > MAX_SPLIT_FILES)
        throw new Error(
          `Split into at most ${MAX_SPLIT_FILES} files. Choose more pages per part or fewer split points.`,
        );
      return ranges;
    };
    function preview() {
      try {
        const ranges = plan();
        summary.textContent = `${ranges.length} PDFs, downloaded together as a ZIP.`;
        downloadButton.disabled = false;
      } catch (error) {
        summary.textContent = error.message;
        downloadButton.disabled = true;
      }
    }
    const form = el(
      'form',
      { class: 'stack', novalidate: true },
      el(
        'p',
        { class: 'muted' },
        'The parts are saved on this device in one ZIP file. Form fields in them become fixed page content.',
      ),
      list,
      summary,
    );
    const apply = safe(async () => {
      const ranges = plan();
      const base = name.replace(/\.pdf$/i, '');
      d.close();
      activity = 'Splitting…';
      updateStatus();
      try {
        requireAccess('copy');
        // The source bytes and protection belong to one export, even if the open document
        // changes while its parts are being copied or encrypted.
        const savedProtection = protection;
        const { signal } = dialogController;
        const files = await splitPdf(session.bytes.slice(), ranges, base, { signal });
        for (const file of files) {
          signal.throwIfAborted();
          file.bytes = await exportBytes(file.bytes, savedProtection);
        }
        signal.throwIfAborted();
        download(new Blob(zipParts(files), { type: 'application/zip' }), `${base} split.zip`);
      } finally {
        activity = null;
        updateStatus();
      }
      toast(`已将 ${ranges.length} 个 PDF 打包为 ZIP 下载。`);
    });
    form.onsubmit = (e) => {
      e.preventDefault();
      apply();
    };
    const downloadButton = button('下载 ZIP', 'Download', apply, 'btn primary');
    preview();
    const d = modal('拆分 PDF', form, [button('取消', null, () => d.close()), downloadButton]);
  }
  /** Turn form fields and comments into fixed page content. */
  async function flattenDialog(version = beginDialogRequest()) {
    requireAccess('edit', 'annotate');
    if (!pdf) return;
    const doc = await workingDocument(version);
    if (!doc) return;
    const counts = flattenCounts(doc);
    if (!counts.fields && !counts.annotations) {
      toast('此 PDF 没有可拼合的表单字段或批注。');
      return;
    }
    const option = (id, label, count) => {
      const box = el('input', { type: 'checkbox', id, checked: count > 0, disabled: !count });
      return {
        box,
        row: el(
          'label',
          { class: 'checkbox-row', for: id },
          el('span', {}, `${label} (${count})`),
          box,
        ),
      };
    };
    const fields = option('flatten-fields', '表单域', counts.fields);
    const annotations = option('flatten-annotations', '批注与标记', counts.annotations);
    const form = el(
      'form',
      { class: 'stack' },
      el(
        'p',
        { class: 'muted' },
        '拼合后的字段和批注将成为页面固定内容：所有阅读器都将以相同方式显示它们，且之后无法再填写、移动或删除。不能安全拼合的内容将保留在 PDF 中。链接保持可点击。可通过撤销恢复原始内容。',
      ),
      fields.row,
      annotations.row,
    );
    const apply = safe(async () => {
      const choice = { fields: fields.box.checked, annotations: annotations.box.checked };
      if (!choice.fields && !choice.annotations) {
        toast('请选择要拼合的内容。', { error: true });
        return;
      }
      d.close();
      let done = false;
      await mutate(async (doc) => {
        const fonts = choice.fields ? await flattenFonts(doc) : [];
        done = flattenDocument(doc, { ...choice, fonts });
        return !!(done && (done.fields || done.annotations));
      });
      if (done) {
        const describe = (counts) =>
          [
            counts.fields && `${counts.fields} ${counts.fields === 1 ? 'field' : 'fields'}`,
            counts.annotations &&
              `${counts.annotations} ${counts.annotations === 1 ? 'comment' : 'comments'}`,
          ]
            .filter(Boolean)
            .join(' and ');
        const flattened = describe(done);
        const kept = done.unflattened && describe(done.unflattened);
        toast(
          [
            flattened && `Flattened ${flattened}.`,
            kept &&
              `Kept ${kept} unflattened to preserve ${done.unflattened.fields + done.unflattened.annotations === 1 ? 'its' : 'their'} content.`,
          ]
            .filter(Boolean)
            .join(' '),
        );
      }
    });
    form.onsubmit = (e) => {
      e.preventDefault();
      apply();
    };
    const d = modal('拼合', form, [
      button('取消', null, () => d.close()),
      button('拼合', 'Layers', apply, 'btn primary'),
    ]);
  }
  /** Shrink pictures to their printed resolution and clear leftovers from earlier edits. */
  function reduceSizeDialog() {
    requireAccess('edit');
    if (!pdf) return;
    const rows = Object.entries(COMPRESSION_LEVELS).map(([key, level]) =>
      el(
        'label',
        { class: 'choice-row' },
        el('input', {
          type: 'radio',
          name: 'reduce-level',
          value: key,
          checked: key === 'balanced',
        }),
        el('span', {}, level.label, ' ', el('span', { class: 'muted' }, `· ${level.hint}`)),
      ),
    );
    const list = el(
      'div',
      { class: 'choice-list', role: 'radiogroup', 'aria-label': '图片质量' },
      ...rows,
    );
    const form = el(
      'form',
      { class: 'stack' },
      el(
        'p',
        { class: 'muted' },
        `当前 PDF 大小为 ${formatBytes(session.bytes.length)}。图片将缩小至所选分辨率并保存为 JPEG；文本、绘图和表单字段保持清晰，先前编辑留下的残留内容将被移除。撤销可恢复原始内容。`,
      ),
      list,
    );
    const apply = safe(async () => {
      const level = list.querySelector('input:checked')?.value || 'balanced';
      d.close();
      await reduceSize(level);
    });
    form.onsubmit = (e) => {
      e.preventDefault();
      apply();
    };
    const d = modal('压缩 PDF 大小', form, [
      button('取消', null, () => d.close()),
      button('压缩', 'Shrink', apply, 'btn primary'),
    ]);
    list.querySelector('input:checked')?.focus();
  }
  async function reduceSize(level) {
    requireAccess('edit');
    if (busy || destroyed) return;
    // Rewriting the file invalidates its signatures, as any other edit does.
    if (!(await confirmSignedEdit())) return;
    busy = true;
    activity = '正在压缩文件大小…';
    updateStatus();
    try {
      const before = session.bytes.length;
      const result = await compressPdf(session.bytes, {
        level,
        codec: createImageCodec(loadPdf),
        signal: dialogController.signal,
      });
      if (destroyed) return;
      if (result.after >= before * 0.99) {
        toast('此 PDF 已经是最小状态，无法进一步压缩。');
        return;
      }
      session.adopt(result.bytes);
      await reload();
      toast(`文件大小已从 ${formatBytes(before)} 减小至 ${formatBytes(result.after)}。`);
    } finally {
      busy = false;
      activity = null;
      if (!destroyed) updateStatus();
    }
  }
  /** Save chosen pages as a new PDF on this device. */
  function extractDialog() {
    requireAccess('copy');
    if (!pdf) return;
    const choices = pageChoices('extract-pages', pdf.numPages);
    const progress = el(
      'p',
      { class: 'muted', role: 'status', hidden: true },
      '正在准备您的 PDF…',
    );
    let extracting = false;
    const form = el(
      'form',
      { class: 'stack' },
      el(
        'p',
        { class: 'muted' },
        '选定页面将作为新的 PDF 保存到此设备。其中的表单字段将转为固定页面内容。',
      ),
      choices.list,
      progress,
    );
    const extract = safe(async () => {
      if (extracting || destroyed || !d.open) return;
      const indices = choices.indices();
      requireAccess('copy');
      extracting = true;
      const controls = [downloadButton, ...form.querySelectorAll('input')];
      controls.forEach((control) => (control.disabled = true));
      progress.hidden = false;
      try {
        const extracted = await extractPages(session.bytes, indices);
        if (destroyed || !d.open) return;
        const bytes = await exportBytes(extracted);
        if (destroyed || !d.open) return;
        // A long list of scattered pages would not fit a file name; their count does. One
        // page is named as Extract page in the page's menu names it.
        const { file, message } = extractedPages(indices);
        download(bytes, file);
        d.close();
        toast(message);
      } catch (error) {
        if (!destroyed && d.open) throw error;
      } finally {
        extracting = false;
        controls.forEach((control) => (control.disabled = false));
        progress.hidden = true;
      }
    });
    form.onsubmit = (e) => {
      e.preventDefault();
      extract();
    };
    const downloadButton = button('下载页面', 'Download', extract, 'btn primary');
    const d = modal(
      '提取页面',
      form,
      [button('取消', null, () => d.close()), downloadButton],
      dialogOptions,
    );
  }
  function openSearch() {
    // The Find bar belongs to the page view, which Organize pages stands in for.
    closeOrganizer();
    searchBar.hidden = false;
    searchInput.focus();
    searchInput.select();
  }
  function resetSearch() {
    clearTimeout(searchTimer);
    searchTimer = null;
    searchGeneration++;
    pendingSearch = null;
    matchedQuery = '';
    searchResults = [];
    activeMatch = -1;
    searchCount.textContent = '';
    clearSearchMarks();
  }
  function claimSearchNavigation() {
    // A new search choice retires older destinations before either lookup finishes.
    pendingNavigation = null;
    revealComment = null;
    navigationGeneration++;
    updateStatus();
    return navigationGeneration;
  }
  function scheduleSearch(delay = 0, takeNavigation = false) {
    resetSearch();
    const query = searchQuery(searchInput.value);
    if (!query || !pdf) return;
    const request = {
      token: searchGeneration,
      query,
      direction: 1,
      navigation: takeNavigation ? claimSearchNavigation() : navigationGeneration,
    };
    // A refresh after committing an edit must not inherit the pending page choice's
    // permission to navigate. An explicit search action can claim it again later.
    if (!takeNavigation && pendingNavigation) request.navigation = null;
    pendingSearch = request;
    searchCount.textContent = 'Searching…';
    if (delay) searchTimer = setTimeout(() => findText(request), delay);
    else findText(request);
  }
  async function findText(request) {
    clearTimeout(searchTimer);
    searchTimer = null;
    const { token, query } = request;
    const thisPdf = pdf;
    const isCurrent = () => !destroyed && token === searchGeneration && pdf === thisPdf;
    // Publish one complete result set. A slow page must not expose partial results to
    // navigation, or let an obsolete query append matches to its replacement's results.
    const results = [];
    try {
      for (let i = 0; i < thisPdf.numPages; i++) {
        let haystack = searchTextCache.get(i);
        if (haystack === undefined) {
          // Extraction is the slow part of a search; keep it for the next query.
          const page = await thisPdf.getPage(i + 1);
          if (!isCurrent()) return;
          const text = await page.getTextContent();
          if (!isCurrent()) return;
          haystack = indexPageText(text.items).text;
          searchTextCache.set(i, haystack);
        }
        const count = countMatches(haystack, query);
        if (count) results.push({ page: i, count });
      }
      if (!isCurrent()) return;
      pendingSearch = null;
      matchedQuery = query;
      searchResults = results;
      if (totalMatches()) {
        if (request.navigation === navigationGeneration) jumpMatch(request.direction);
        else {
          // Keep the results available, but a newer page choice owns navigation.
          const total = totalMatches();
          searchCount.textContent = `${total} ${total === 1 ? 'match' : 'matches'}`;
          markSearch();
        }
      } else {
        searchCount.textContent = '无匹配项';
        markSearch();
      }
    } catch {
      if (isCurrent()) {
        pendingSearch = null;
        searchCount.textContent = '搜索不可用';
      }
    }
  }
  /** Non-overlapping occurrences of `query` in folded page text, as markSearch finds them. */
  function countMatches(haystack, query) {
    let count = 0;
    for (
      let at = haystack.indexOf(query);
      at !== -1;
      at = haystack.indexOf(query, at + query.length)
    )
      count++;
    return count;
  }
  const totalMatches = () => searchResults.reduce((sum, result) => sum + result.count, 0);
  /** The page holding match `index` across the document, and its ordinal on that page. */
  function locateMatch(index) {
    let offset = 0;
    for (const { page, count } of searchResults) {
      if (index < offset + count) return { page, ordinal: index - offset };
      offset += count;
    }
    return null;
  }
  function jumpMatch(direction) {
    if (pendingSearch) {
      pendingSearch.direction = direction;
      pendingSearch.navigation = claimSearchNavigation();
      if (searchTimer !== null) findText(pendingSearch);
      return;
    }
    const total = totalMatches();
    if (!total) return;
    if (activeMatch < 0) {
      // Start at the current page's first/last match, wrapping when needed. This also
      // applies when a search finished after navigation and has no selected result yet.
      let start = direction > 0 ? 0 : total - 1,
        offset = 0;
      for (const result of searchResults) {
        if (direction > 0 && result.page >= pageIndex) {
          start = offset;
          break;
        }
        if (direction < 0 && result.page <= pageIndex) start = offset + result.count - 1;
        offset += result.count;
      }
      activeMatch = start;
    } else activeMatch = (activeMatch + direction + total) % total;
    searchCount.textContent = `第 ${activeMatch + 1} 项，共 ${total} 项`;
    const { page } = locateMatch(activeMatch);
    // A same-page match is still a navigation choice when an older request is pending.
    if (page === pageIndex && !pendingNavigation) markSearch();
    else navigate(page);
  }
  function markSearch() {
    if (!pageReady || !pageTextIndex) return;
    const q = matchedQuery;
    const { text, ranges, origins } = pageTextIndex;
    const matches = [];
    if (q)
      for (let at = text.indexOf(q); at !== -1; at = text.indexOf(q, at + q.length))
        matches.push([at, at + q.length]);
    const current = locateMatch(activeMatch);
    const currentOrdinal = current?.page === pageIndex ? current.ordinal : -1;
    let next = 0;
    textLayer.textDivs.forEach((node, index) => {
      const range = ranges[index],
        origin = origins[index];
      while (next < matches.length && matches[next][1] <= range.start) next++;
      const hits = [];
      for (let m = next; m < matches.length && matches[m][0] < range.end; m++) {
        const from = Math.max(matches[m][0], range.start) - range.start,
          to = Math.min(matches[m][1], range.end) - range.start;
        if (to > from) hits.push([origin[from], origin[to - 1] + 1, m === currentOrdinal]);
      }
      markSpan(node, hits);
    });
    revealCurrentMatch();
  }
  /** Scroll the workspace just enough to show the current match. */
  function revealCurrentMatch() {
    const mark = textContainer.querySelector('.search-hit-current');
    if (!mark) return;
    const box = mark.getBoundingClientRect();
    if (!box.width && !box.height) return;
    revealBox(box);
  }
  /** Scroll the workspace to center a box (client coordinates) that is not fully in view. */
  function revealBox(box) {
    const view = workspace.getBoundingClientRect();
    if (box.top < view.top || box.bottom > view.bottom)
      workspace.scrollTop += box.top - view.top - (view.height - box.height) / 2;
    if (box.left < view.left || box.right > view.right)
      workspace.scrollLeft += box.left - view.left - (view.width - box.width) / 2;
  }
  /** Wrap only the matched characters of a text span, leaving unchanged spans untouched. */
  function markSpan(node, hits) {
    const key = hits.join(';');
    if ((node.dataset.searchHits || '') === key) return;
    const source = node.textContent;
    if (!hits.length) {
      node.textContent = source;
      delete node.dataset.searchHits;
      return;
    }
    const fragment = document.createDocumentFragment();
    let at = 0;
    for (let [from, to, active] of hits) {
      from = Math.max(from, at);
      if (to <= from) continue;
      if (from > at) fragment.append(source.slice(at, from));
      const mark = document.createElement('mark');
      mark.className = active ? 'search-hit search-hit-current' : 'search-hit';
      mark.textContent = source.slice(from, to);
      fragment.append(mark);
      at = to;
    }
    if (at < source.length) fragment.append(source.slice(at));
    node.replaceChildren(fragment);
    node.dataset.searchHits = key;
  }
  function clearSearchMarks() {
    for (const node of textContainer.querySelectorAll('[data-search-hits]')) {
      node.textContent = node.textContent;
      delete node.dataset.searchHits;
    }
  }
  /**
   * The letter of a Ctrl or Command shortcut. On a Cyrillic, Greek, Hebrew, or Arabic layout the
   * key reports its own letter (Ctrl+Z arrives as "я"), so no shortcut worked; the key's place on
   * the keyboard names it instead, as the browser's own shortcuts do. AltGr typing is left alone.
   */
  const shortcutKey = (e) =>
    (e.ctrlKey || e.metaKey) &&
    !e.altKey &&
    /^Key[A-Z]$/.test(e.code) &&
    e.key.length === 1 &&
    !/[\x00-\x7f]/.test(e.key)
      ? e.code.slice(3).toLowerCase()
      : e.key.toLowerCase();
  /**
   * Whether Alt with Ctrl or ⌘ goes with G. Option changes the letter a Mac reports (⌥G is "©"),
   * so the key's place names it then; AltGr, which Windows reports as Ctrl and Alt, types instead.
   */
  const goToPageKey = (e) =>
    !e.getModifierState?.('AltGraph') &&
    (e.key.toLowerCase() === 'g' || (e.code === 'KeyG' && !/^[a-z]$/i.test(e.key)));
  function onKey(e) {
    // Native dialogs own the keyboard while open, including Escape.
    if (e.isComposing || document.querySelector('dialog[open]')) return;
    // So does puter.js's user menu: keys from its shadow root arrive as the element's.
    if (e.target.closest?.('puter-user-menu')) return;
    if (e.key === 'Escape' && closeOverlaidPanel(e.target)) {
      e.preventDefault();
      return;
    }
    const formatKey = { b: 'bold', i: 'italic', u: 'underline' }[shortcutKey(e)];
    if (
      textEdit &&
      !busy &&
      formatKey &&
      (e.ctrlKey || e.metaKey) &&
      !e.altKey &&
      !e.shiftKey &&
      (e.target === textEdit.input ||
        textEdit.input.contains(e.target) ||
        textEdit.handles.contains(e.target) ||
        toolOptions.contains(e.target))
    ) {
      e.preventDefault();
      toggleTextStyle(formatKey);
      return;
    }
    if (e.key === 'Escape' && (textEdit || textPointer)) {
      e.preventDefault();
      cancelTextSelection();
      leaveTextEdit(workspace);
      return;
    }
    if (e.key === 'Escape' && selectedHighlight) {
      closeHighlightEditor();
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && (highlightSelection || highlightCaptureTimer)) {
      window.getSelection()?.removeAllRanges();
      clearHighlightSelection();
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && gesture) {
      gesture = null;
      clearOverlay();
      e.preventDefault();
      return;
    }
    if (tool === 'measure' && measurePath.length && (e.key === 'Enter' || e.key === 'Escape')) {
      e.preventDefault();
      if (e.key === 'Enter') safe(finishMeasure)();
      else {
        measurePath = [];
        clearOverlay();
        hint.textContent = measureHint();
      }
      return;
    }
    if (e.key === 'Escape' && tool === 'link') {
      e.preventDefault();
      safe(() => setTool('select'))();
      return;
    }
    if (e.key === 'Escape' && tool === 'crop') {
      e.preventDefault();
      if (cropDraft) {
        discardCropDraft();
        clearOverlay();
        overlay.focus({ preventScroll: true });
      } else safe(() => setTool('select'))();
      return;
    }
    const modifier = e.ctrlKey || e.metaKey;
    const key = shortcutKey(e);
    // A widget that answers a key itself cancels it: the comparison's list of changes takes
    // Home and End, its view F3. The page behind must not turn, or its Find bar open, as well.
    const claimed = e.defaultPrevented;
    const typing = e.target.isContentEditable || /input|textarea|select/i.test(e.target.tagName);
    // Only a field that takes typed text has a native undo of its own; a focused select,
    // checkbox, or color picker (a zoom or size choice, for instance) leaves Undo to the app.
    const textEntry =
      e.target.isContentEditable ||
      /textarea/i.test(e.target.tagName) ||
      (/input/i.test(e.target.tagName) &&
        !['checkbox', 'radio', 'range', 'color', 'button', 'submit', 'reset', 'file'].includes(
          e.target.type,
        ));
    if (modifier && key === 's') {
      e.preventDefault();
      // When Puter opened the app, Save As chooses a folder in the cloud; elsewhere it downloads.
      if (e.shiftKey) safe(P.launchedByPuter() ? saveAs : downloadPdf)();
      else safe(() => save())();
    } else if (modifier && key === 'f') {
      e.preventDefault();
      openSearch();
    } else if (!claimed && ((modifier && !e.altKey && key === 'g') || e.key === 'F3')) {
      // Find next and previous, as browsers and editors bind them.
      e.preventDefault();
      if (searchBar.hidden) openSearch();
      else jumpMatch(e.shiftKey ? -1 : 1);
    } else if (modifier && !e.shiftKey && !e.altKey && key === 'p') {
      e.preventDefault();
      if (!busy) pageDialog(printDialog)();
    } else if (modifier && !e.altKey && ['=', '+', '-', '_'].includes(e.key)) {
      // The application zooms the page where a browser would zoom the whole interface.
      e.preventDefault();
      safe(() => setZoom(zoomStep(e.key === '-' || e.key === '_' ? -1 : 1)))();
    } else if (modifier && !e.altKey && !e.shiftKey && ['0', '1', '2'].includes(e.key)) {
      // Fit page, actual size, and fit width, as desktop PDF editors bind them.
      e.preventDefault();
      safe(() => setZoom({ 0: 'page', 1: '1', 2: 'fit' }[e.key]))();
    } else if (
      (modifier && e.shiftKey && !e.altKey && key === 'n') ||
      (modifier && e.altKey && !e.shiftKey && goToPageKey(e))
    ) {
      // Ctrl/⌘ Shift N is Acrobat's binding, but Chrome, Edge, and Safari keep it for a new
      // private window and the page never hears it; Ctrl/⌘ Alt G (Preview's) always arrives.
      e.preventDefault();
      if (pdf && pdf.numPages > 1 && !busy) safe(goToPage)();
    } else if (modifier && !e.shiftKey && !e.altKey && key === 'd') {
      e.preventDefault();
      if (!busy) pageDialog(detailsDialog)();
    } else if (modifier && e.shiftKey && !e.altKey && key === 'r' && !typing) {
      e.preventDefault();
      if (!busy && access().assemble)
        pageAction(() => mutate((doc) => rotatePage(doc, pageIndex), null, 'assemble'))();
    } else if (modifier && e.shiftKey && !e.altKey && key === 'd' && !typing) {
      e.preventDefault();
      if (!busy && access().assemble && pdf?.numPages > 1)
        pageDialog(() => deletePageAt(pageIndex))();
    } else if (modifier && !e.shiftKey && !e.altKey && key === 'l') {
      e.preventDefault();
      toggleFullScreen();
    } else if (e.key === 'F4' && !modifier && !e.altKey) {
      e.preventDefault();
      if (e.shiftKey) toggleToolsPanel();
      else safe(() => toggleSidebar())();
    } else if (!modifier && !e.altKey && !typing && (e.key === 'Home' || e.key === 'End')) {
      if (!pdf || claimed || e.target.closest?.('.page-sidebar, .tools-pane, .menu')) return;
      e.preventDefault();
      navigate(e.key === 'Home' ? 0 : pageCount - 1);
    } else if (
      !modifier &&
      !e.altKey &&
      !e.shiftKey &&
      !typing &&
      !claimed &&
      !textEdit &&
      ['v', 'h'].includes(key) &&
      !e.target.closest?.('.page-sidebar, .tools-pane, .menu, .form-layer')
    ) {
      // Single-key tool shortcuts: V for Select, H for Hand.
      e.preventDefault();
      safe(() => setTool(key === 'v' ? 'select' : 'hand'))();
    } else if (e.key === 'Escape' && editorRoot.classList.contains('read-mode')) {
      e.preventDefault();
      setReadMode(false);
    } else if (modifier && !e.altKey && !e.shiftKey && key === 'a' && !typing) {
      // Select All belongs to the page's words; a field with the focus keeps its own.
      if (selectPageText()) e.preventDefault();
    } else if (modifier && key === 'z' && !textEntry) {
      e.preventDefault();
      safe(() => history(e.shiftKey ? 'redo' : 'undo'))();
    } else if (e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && key === 'y' && !textEntry) {
      // Ctrl Y is the Windows and Linux redo convention alongside Ctrl Shift Z.
      e.preventDefault();
      safe(() => history('redo'))();
    } else if (e.altKey && !typing && !claimed && e.key === 'ArrowRight') {
      // Alt/Option + Arrow moves the caret by word inside fields; only navigate outside them.
      e.preventDefault();
      navigateBy(1);
    } else if (e.altKey && !typing && !claimed && e.key === 'ArrowLeft') {
      e.preventDefault();
      navigateBy(-1);
    }
  }
  window.addEventListener('keydown', onKey);
  /**
   * Where the tools pane or the side panel lies over the page, Escape from inside it (or from
   * the control that opened it) closes it as it would a popover, and the focus goes back to
   * that control. Docked beside the page they stay, as panels do.
   */
  function closeOverlaidPanel(target) {
    if (!(target instanceof Node)) return false;
    if (
      !editorRoot.classList.contains('hide-tools') &&
      window.matchMedia('(max-width: 1000px)').matches &&
      (toolsPane.contains(target) || topTabs.contains(target))
    ) {
      const opener = topTabs.querySelector('.top-tab[aria-pressed="true"]');
      toggleToolsPanel(false);
      opener?.focus({ preventScroll: true });
      return true;
    }
    if (
      !editorRoot.classList.contains('hide-pages') &&
      window.matchMedia('(max-width: 760px)').matches &&
      (sidebar.contains(target) || sidebarTabs.contains(target))
    ) {
      hideSidebar();
      sidebarTabs.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
      return true;
    }
    return false;
  }
  /** Whether a fitted page was rendered for a workspace of another size than the current one. */
  const needsRefit = () =>
    (scaleMode === 'fit' && workspace.clientWidth !== renderedWorkspaceWidth) ||
    (scaleMode === 'page' &&
      (workspace.clientWidth !== renderedWorkspaceWidth ||
        workspace.clientHeight !== renderedWorkspaceHeight)) ||
    (fitSizesStale &&
      (scaleMode === 'fit' || scaleMode === 'page') &&
      !!viewport &&
      Math.abs(computeZoom(viewport.clone({ scale: 1 })) - zoom) > 1e-6);
  /** Defer refitting while properties are open, keeping page handles and selection stable. */
  function refitPage() {
    if (!busy && !destroyed && !properties.active && !textEdit && !noteEdit && needsRefit())
      safe(async () => {
        if (pageImages.dirty) await pageImages.finish();
        if (needsRefit()) await renderPage();
      })();
  }
  // Ctrl + wheel, which is also what a trackpad pinch sends, zooms the page around the pointer
  // instead of letting the browser zoom the whole application.
  let wheelDistance = 0,
    wheelZooming = false;
  workspace.addEventListener(
    'wheel',
    (e) => {
      if (!(e.ctrlKey || e.metaKey) || !pdf) return;
      e.preventDefault();
      wheelDistance += e.deltaMode === 0 ? e.deltaY : e.deltaY * 24;
      // Pinches arrive as many small deltas; a notch of a mouse wheel as one large one.
      if (Math.abs(wheelDistance) < 24) return;
      const direction = wheelDistance < 0 ? 1 : -1;
      wheelDistance = 0;
      if (wheelZooming || busy) return;
      const next = zoomStep(direction);
      if (next === scaleMode) return;
      wheelZooming = true;
      safe(() => setZoom(next, { x: e.clientX, y: e.clientY }))().finally(() => {
        wheelZooming = false;
      });
    },
    { passive: false },
  );
  // On a touch screen two fingers zoom the page around the point between them, as in a PDF
  // reader. The browser's own pinch magnified the whole application instead, pushing the tools
  // off screen and stretching the rendered page into a blur. The page is scaled while the
  // fingers move and drawn afresh at the new zoom once they lift.
  let pinch = null;
  const touchSpan = ([a, b]) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  // Where a finger rests on something that takes touches itself (a drawing tool's surface, an
  // object being moved), the browser never zoomed either, so neither does the page.
  const takesTouch = (node) => {
    for (let at = node; at && at !== workspace; at = at.parentElement)
      if (getComputedStyle(at).touchAction === 'none') return true;
    return false;
  };
  /** The pages' stretch from a pinch, kept after the fingers lift until the zoom is drawn. */
  function clearPinchScale() {
    if (pinch) return;
    pageStackElement.style.transform = pageStackElement.style.transformOrigin = '';
  }
  function endPinch(commit) {
    if (!pinch) return;
    const { scale, x, y } = pinch;
    pinch = null;
    if (!commit || destroyed || Math.abs(scale - 1) < 0.02) return clearPinchScale();
    const next = Math.max(0.02, Math.round(zoom * scale * 100) / 100);
    // The stretched pages stand in until the page is laid out at the new zoom. Clearing them
    // at once showed the old size for as long as the page took to draw, then the new one.
    safe(() => setZoom(String(next), { x, y }))().finally(clearPinchScale);
  }
  workspace.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 2) return endPinch(false);
      const touches = [...e.touches];
      if (
        !pdf ||
        busy ||
        touches.some((t) => !workspace.contains(t.target) || takesTouch(t.target))
      )
        return;
      panning = null;
      editorRoot.classList.remove('panning');
      // A pinch started while the last one is still being drawn starts from the pages as laid out.
      clearPinchScale();
      const x = (touches[0].clientX + touches[1].clientX) / 2,
        y = (touches[0].clientY + touches[1].clientY) / 2;
      pinch = { span: touchSpan(touches) || 1, x, y, scale: 1 };
      const box = pageStackElement.getBoundingClientRect();
      pageStackElement.style.transformOrigin = `${x - box.left}px ${y - box.top}px`;
    },
    { passive: true },
  );
  workspace.addEventListener(
    'touchmove',
    (e) => {
      if (!pinch || e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      // Within the zoom's range; a page fitted below its smallest step does not shrink further.
      const least = Math.min(zoom, ZOOM_LEVELS[0]),
        most = Math.max(zoom, ZOOM_LEVELS.at(-1));
      const wanted = (zoom * touchSpan([...e.touches])) / pinch.span;
      pinch.scale = Math.min(most, Math.max(least, wanted)) / zoom;
      pageStackElement.style.transform = `scale(${pinch.scale})`;
    },
    { passive: false },
  );
  workspace.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) endPinch(true);
  });
  workspace.addEventListener('touchcancel', () => endPinch(false));
  let resizeTimer;
  const resizeObserver = new ResizeObserver(() => {
    // Where the page starts below the tool rows: on narrow screens the navigation panel
    // overlays only the page, so the tools stay in reach while it is open.
    editorRoot.style.setProperty(
      '--document-bars',
      `${workspace.parentNode.offsetTop + workspace.offsetTop}px`,
    );
    snapPaper();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refitPage, 150);
  });
  resizeObserver.observe(workspace);
  updateStatus();
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    closeComparison();
    stopReading();
    stack.destroy();
    Promise.resolve(ocrEngine?.terminate()).catch(() => {});
    document.removeEventListener('fullscreenchange', onFullscreen);
    overlaidTools.removeEventListener('change', onOverlaidTools);
    overlaidPages.removeEventListener('change', onOverlaidPages);
    window.removeEventListener('keydown', onSpace);
    window.removeEventListener('keyup', onSpace);
    window.removeEventListener('blur', releaseSpace);
    saveController?.abort();
    cancelTextSelection();
    dialogController.abort();
    printNotice.remove();
    document.body.classList.remove('pdf-restricted-print');
    document.removeEventListener('copy', restrictCopy);
    document.removeEventListener('cut', restrictCopy);
    document.removeEventListener('dragstart', restrictCopy);
    clearTextPreview(textEdit);
    pageImages.destroy();
    annotationLayer.destroy();
    generation++;
    pageRenderGeneration++;
    searchGeneration++;
    clearTimeout(searchTimer);
    clearTimeout(resizeTimer);
    clearTimeout(highlightCaptureTimer);
    resizeObserver.disconnect();
    tabsObserver.disconnect();
    thumbnailObserver?.disconnect();
    renderTask?.cancel();
    textLayer?.cancel();
    loadingTask?.destroy().catch(() => {});
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keydown', updateDrawingModifier);
    window.removeEventListener('keyup', updateDrawingModifier);
    document.removeEventListener('selectionchange', captureHighlightSelection);
    document.removeEventListener('pointermove', followTextDrag, true);
    document.removeEventListener('pointerup', endTextDrag, true);
    document.removeEventListener('pointercancel', endTextDrag, true);
    menubar.destroy();
    reorder.destroy();
    closeMenu();
    document.querySelector('#announcer').textContent = '';
  }
  const ready = (async () => {
    try {
      await reload();
    } catch (error) {
      if (!destroyed) {
        destroy();
        throw error;
      }
    } finally {
      initializing = false;
      busy = false;
      updateStatus();
    }
    // The PDF can say how it opens: its layout, a side panel, a page, and a zoom.
    if (!destroyed) await applyInitialView().catch(() => {});
  })();
  async function applyInitialView() {
    const doc = await loadPdfDocument(session.bytes, { updateMetadata: false });
    if (destroyed) return;
    const view = readInitialView(doc);
    pdfaClaim = readPdfaClaim(doc);
    showStandardsBar();
    if (view.displayTitle) {
      const title = doc.getTitle?.()?.trim();
      if (title) shownTitle = title;
    }
    if (view.layout !== 'default') setPageDisplay(view.layout, { remember: false });
    const panel = {
      bookmarks: 'outline',
      pages: 'pages',
      attachments: 'attachments',
      layers: 'layers',
    }[view.panel];
    if (panel && !sidebarTabs.querySelector(`[data-tab="${panel}"]`)?.hidden) {
      showSidebarTab(panel);
      if (editorRoot.classList.contains('hide-pages')) await toggleSidebar(true);
    }
    if (view.page > 0 && view.page < pageCount) await navigate(view.page);
    // A magnification beyond the zoom controls' 25–400% opens at the nearest end of it.
    const asked =
      typeof view.zoom === 'number'
        ? Math.min(ZOOM_LEVELS.at(-1), Math.max(ZOOM_LEVELS[0], view.zoom))
        : view.zoom;
    if (asked !== 'default') await setZoom(String(asked));
    updateStatus();
  }
  return {
    ready,
    get dirty() {
      return (
        session.dirty ||
        protectionDirty ||
        saving ||
        (busy && !initializing) ||
        pendingTextEdit() ||
        pendingNoteEdit() ||
        pageForms.draft.dirty ||
        pageImages.dirty
      );
    },
    updateAccount: ({ resetCloud = false } = {}) => {
      if (resetCloud) {
        // Cloud destinations and pending saves belong to the account that chose them.
        // A later sign-in starts with a new copy, leaving local content and history available.
        saveGeneration++;
        // SDK writes and encryption have no cancellation API. Stop waiting so an ended
        // account cannot leave the retained document locked behind its pending save.
        saveController?.abort();
        path = null;
        remote = null;
        cloudRevision = null;
      }
      updateStatus();
    },
    get name() {
      return name;
    },
    // Leaving asks to save; one already under way is awaited, and its own caller reports a
    // failure. The caller then checks `dirty` to see whether the PDF was saved.
    save: () =>
      saving
        ? Promise.resolve(runningSave).then(
            () => {},
            () => {},
          )
        : save(),
    destroy,
  };
}
