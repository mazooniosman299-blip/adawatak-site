'use strict';

function initializeBlockPuzzle() {
  const SIZE = 8;
  const KEY = 'block-party-high-score';

  const COLORS = [
    '#a78af5',
    '#62d5bf',
    '#f4b56b',
    '#ed87ad',
    '#73b5f3'
  ];

  const SHAPES = [
    [[0, 0]],
    [[0, 0], [0, 1]],
    [[0, 0], [1, 0]],
    [[0, 0], [0, 1], [0, 2]],
    [[0, 0], [1, 0], [2, 0]],
    [[0, 0], [0, 1], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [0, 2], [0, 3]],
    [[0, 0], [1, 0], [2, 0], [3, 0]],
    [[0, 0], [1, 0], [2, 0], [2, 1]],
    [[0, 0], [0, 1], [0, 2], [1, 1]],
    [[0, 1], [0, 2], [1, 0], [1, 1]],
    [[0, 0], [1, 0], [1, 1]],
    [
      [0, 0], [0, 1], [0, 2],
      [1, 0], [1, 1], [1, 2],
      [2, 0], [2, 1], [2, 2]
    ]
  ];

  const $ = id => document.getElementById(id);

  const boardEl = $('board');
  const trayEl = $('tray');
  const dialog = $('game-over');

  if (
    !boardEl ||
    !trayEl ||
    !dialog ||
    boardEl.dataset.initialized
  ) {
    return;
  }

  boardEl.dataset.initialized = 'true';

  const nativeDialog =
    typeof dialog.showModal === 'function' &&
    typeof dialog.close === 'function';

  function closeGameOver() {
    if (nativeDialog && dialog.open) {
      dialog.close();
    }

    dialog.removeAttribute('open');
    dialog.classList.remove('dialog-fallback');
  }

  function showGameOver() {
    if (nativeDialog) {
      try {
        dialog.showModal();
        return;
      } catch {
        // نستخدم البديل إذا كانت بيئة المعاينة تمنع النافذة.
      }
    }

    dialog.classList.add('dialog-fallback');
    dialog.setAttribute('open', '');
    $('play-again').focus();
  }

  let grid;
  let pieces;
  let score;
  let best = 0;
  let selected = null;
  let busy = false;
  let ended = false;

  let drag = null;
  let round = 0;
  let recordAtStart = 0;

  try {
    best = Number(localStorage.getItem(KEY)) || 0;
  } catch {
    // تستمر اللعبة إذا منع المتصفح التخزين المحلي.
  }

  // واجهات جاهزة لربط إعلانات AdMob داخل التطبيق الأصلي.
  // لا يتم تحميل إعلانات فعلية في نسخة الويب الحالية.
  window.BlockPuzzleAds = Object.assign(
    {
      showBanner: async ({ container }) => {
        container.dataset.adState = 'placeholder';
      },
      showInterstitial: async () => {}
    },
    window.BlockPuzzleAds
  );

  async function adHook(name, payload) {
    try {
      await window.BlockPuzzleAds[name](payload);
    } catch (error) {
      console.warn('Ad hook unavailable:', name, error);
    }
  }

  const cells = Array.from(
    { length: SIZE * SIZE },
    (_, i) => {
      const el = document.createElement('button');

      el.className = 'cell';

      el.setAttribute(
        'aria-label',
        `صف ${Math.floor(i / SIZE) + 1}، عمود ${i % SIZE + 1}، فارغ`
      );

      el.addEventListener('click', () => {
        if (
          selected !== null &&
          !busy &&
          !ended &&
          !drag
        ) {
          place(
            selected,
            Math.floor(i / SIZE),
            i % SIZE
          );
        }
      });

      boardEl.append(el);
      return el;
    }
  );

  function fits(piece, row, col) {
    return piece && piece.shape.every(([r, c]) => {
      return (
        row + r >= 0 &&
        col + c >= 0 &&
        row + r < SIZE &&
        col + c < SIZE &&
        !grid[row + r][col + c]
      );
    });
  }

  function canPlay() {
    return pieces.some(piece => {
      return piece && grid.some((row, r) => {
        return row.some((_, c) => fits(piece, r, c));
      });
    });
  }

  function updateScore() {
    $('score').textContent = score;

    if (score > best) {
      best = score;

      try {
        localStorage.setItem(KEY, String(best));
      } catch {
        // تبقى النتيجة متاحة خلال الجلسة الحالية.
      }
    }

    $('best').textContent = best;
  }

  function renderBoard() {
    cells.forEach((el, i) => {
      const row = Math.floor(i / SIZE);
      const col = i % SIZE;
      const color = grid[row][col];

      el.className = `cell${color ? ' filled' : ''}`;

      el.style.setProperty(
        '--color',
        color || 'transparent'
      );

      el.setAttribute(
        'aria-label',
        `صف ${row + 1}، عمود ${col + 1}، ${color ? 'مشغول' : 'فارغ'}`
      );
    });
  }

  function pieceElement(piece, unit) {
    const el = document.createElement('div');

    el.className = 'piece-grid';
    el.style.setProperty('--cols', piece.width);
    el.style.setProperty('--rows', piece.height);

    if (unit) {
      el.style.setProperty('--unit', `${unit}px`);
    }

    piece.shape.forEach(([r, c]) => {
      const block = document.createElement('span');

      block.className = 'mini-block';

      block.style.cssText =
        `--r:${r + 1};--c:${c + 1};--color:${piece.color}`;

      el.append(block);
    });

    return el;
  }

  function renderTray() {
    trayEl.replaceChildren();

    pieces.forEach((piece, i) => {
      const slot = document.createElement('button');

      slot.className =
        `piece-slot${selected === i ? ' selected' : ''}`;

      slot.disabled = !piece || busy || ended;

      slot.setAttribute(
        'aria-label',
        piece
          ? `القطعة ${i + 1}، ${piece.shape.length} مكعبات. اخترها ثم اختر مكانها على اللوحة`
          : 'قطعة مستخدمة'
      );

      slot.setAttribute(
        'aria-pressed',
        String(selected === i)
      );

      if (piece) {
        slot.append(pieceElement(piece));
      }

      slot.addEventListener('pointerdown', e => {
        startDrag(e, i, slot);
      });

      slot.addEventListener('click', () => {
        if (busy || ended || !pieces[i]) {
          return;
        }

        selected = selected === i ? null : i;
        renderTray();
      });

      trayEl.append(slot);
    });
  }

  function deal() {
    pieces = Array.from({ length: 3 }, () => {
      const shape =
        SHAPES[Math.floor(Math.random() * SHAPES.length)];

      return {
        shape,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        width: Math.max(...shape.map(p => p[1])) + 1,
        height: Math.max(...shape.map(p => p[0])) + 1
      };
    });
  }

  function reset() {
    round++;
    cancelDrag();
    closeGameOver();

    grid = Array.from(
      { length: SIZE },
      () => Array(SIZE).fill(null)
    );

    score = 0;
    recordAtStart = best;
    busy = false;
    ended = false;
    selected = null;

    $('celebration').replaceChildren();

    $('status').textContent =
      'اسحب قطعة إلى اللوحة أو اخترها ثم اضغط مكانها';

    deal();
    renderBoard();
    renderTray();
    updateScore();
  }

  function celebrate(count, points, cleared) {
    const layer = $('celebration');

    layer.replaceChildren();

    const label = document.createElement('span');

    label.className = 'score-pop';
    label.textContent = `+${points} ✦`;

    layer.append(label);

    cleared.forEach(i => {
      const spark = document.createElement('span');

      spark.className = 'spark';

      spark.style.cssText = [
        `--x:${(i % SIZE + 0.5) / SIZE * 100}%`,
        `--y:${(Math.floor(i / SIZE) + 0.5) / SIZE * 100}%`,
        `--color:${COLORS[i % COLORS.length]}`,
        `--dx:${Math.random() * 100 - 50}px`,
        `--dy:${Math.random() * 100 - 70}px`
      ].join(';');

      layer.append(spark);
    });

    $('status').textContent = count > 1
      ? `رائع! أزلت ${count} خطوط دفعة واحدة ✨`
      : 'أحسنت! مساحة جديدة للعب ✨';
  }

  async function place(index, row, col) {
    const piece = pieces[index];

    if (busy || ended || !fits(piece, row, col)) {
      $('status').textContent =
        'لا تتسع القطعة هنا. جرّب مكانًا آخر';

      return;
    }

    const currentRound = round;

    busy = true;

    piece.shape.forEach(([r, c]) => {
      grid[row + r][col + c] = piece.color;
    });

    pieces[index] = null;
    selected = null;
    score += piece.shape.length;

    const rows = [];
    const cols = [];

    for (let i = 0; i < SIZE; i++) {
      if (grid[i].every(Boolean)) {
        rows.push(i);
      }

      if (grid.every(boardRow => Boolean(boardRow[i]))) {
        cols.push(i);
      }
    }

    const cleared = new Set();

    rows.forEach(r => {
      for (let c = 0; c < SIZE; c++) {
        cleared.add(r * SIZE + c);
      }
    });

    cols.forEach(c => {
      for (let r = 0; r < SIZE; r++) {
        cleared.add(r * SIZE + c);
      }
    });

    renderBoard();
    renderTray();

    if (cleared.size) {
      const lines = rows.length + cols.length;

      const points =
        lines * 100 + Math.max(0, lines - 1) * 50;

      score += points;
      updateScore();

      cleared.forEach(i => {
        cells[i].classList.add('clearing');
      });

      celebrate(lines, points, cleared);

      await new Promise(resolve => {
        setTimeout(resolve, 320);
      });

      if (round !== currentRound) {
        return;
      }

      cleared.forEach(i => {
        grid[Math.floor(i / SIZE)][i % SIZE] = null;
      });
    } else {
      $('status').textContent =
        'خطوة موفقة! أكمل صفًا أو عمودًا';
    }

    if (pieces.every(piece => !piece)) {
      deal();
    }

    busy = false;

    renderBoard();
    updateScore();

    if (!canPlay()) {
      ended = true;

      $('final-score').textContent = score;

      $('record-note').textContent =
        score > recordAtStart
          ? '♛ رقم قياسي جديد! أحسنت'
          : `أعلى نتيجة: ${best}`;

      showGameOver();

      void adHook('showInterstitial', {
        reason: 'game-over',
        score
      });
    }

    renderTray();
  }

  function clearPreview() {
    cells.forEach(el => {
      el.classList.remove('preview', 'invalid');
    });
  }

  function dragTarget(x, y) {
    const rect = cells[0].getBoundingClientRect();
    const next = cells[1].getBoundingClientRect();
    const step = next.left - rect.left;

    return {
      row: Math.round(
        (y - drag.offsetY - rect.top) / step
      ),
      col: Math.round(
        (x - drag.offsetX - rect.left) / step
      )
    };
  }

  function moveDrag(e) {
    if (!drag || e.pointerId !== drag.id) {
      return;
    }

    if (
      !drag.moved &&
      Math.hypot(
        e.clientX - drag.x,
        e.clientY - drag.y
      ) < 6
    ) {
      return;
    }

    drag.moved = true;

    e.preventDefault();

    drag.slot.classList.add('dragging');
    drag.ghost.hidden = false;

    drag.ghost.style.left =
      `${e.clientX - drag.offsetX}px`;

    drag.ghost.style.top =
      `${e.clientY - drag.offsetY}px`;

    const target = dragTarget(e.clientX, e.clientY);

    drag.target = target;

    clearPreview();

    const valid = fits(
      pieces[drag.index],
      target.row,
      target.col
    );

    pieces[drag.index].shape.forEach(([r, c]) => {
      r += target.row;
      c += target.col;

      if (
        r >= 0 &&
        r < SIZE &&
        c >= 0 &&
        c < SIZE
      ) {
        cells[r * SIZE + c].classList.add(
          valid ? 'preview' : 'invalid'
        );
      }
    });
  }

  function startDrag(e, index, slot) {
    if (
      busy ||
      ended ||
      !pieces[index] ||
      e.button !== 0 ||
      drag
    ) {
      return;
    }

    const piece = pieces[index];
    const unit = cells[0].getBoundingClientRect().width;
    const ghost = pieceElement(piece, unit);
    const gap = parseFloat(getComputedStyle(boardEl).gap);

    ghost.classList.add('drag-ghost');
    ghost.hidden = true;
    ghost.style.gap = `${gap}px`;

    document.body.append(ghost);

    drag = {
      id: e.pointerId,
      index,
      slot,
      ghost,
      x: e.clientX,
      y: e.clientY,
      moved: false,

      offsetX:
        (piece.width * unit + (piece.width - 1) * gap) / 2,

      offsetY:
        piece.height * unit +
        (piece.height - 1) * gap +
        (e.pointerType === 'touch' ? 35 : 8)
    };

    slot.setPointerCapture(e.pointerId);
  }

  function cancelDrag() {
    if (drag) {
      drag.ghost.remove();
      drag.slot.classList.remove('dragging');
      drag = null;
    }

    clearPreview();
  }

  document.addEventListener(
    'pointermove',
    moveDrag,
    { passive: false }
  );

  document.addEventListener('pointerup', e => {
    if (!drag || e.pointerId !== drag.id) {
      return;
    }

    const { index, target, moved, slot } = drag;

    if (moved) {
      slot.addEventListener(
        'click',
        event => event.stopImmediatePropagation(),
        { capture: true, once: true }
      );
    }

    cancelDrag();

    if (moved && target) {
      void place(index, target.row, target.col);
    }
  });

  document.addEventListener('pointercancel', cancelDrag);
  window.addEventListener('blur', cancelDrag);
  window.addEventListener('resize', cancelDrag);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      selected = null;
      cancelDrag();
      renderTray();
    }
  });

  dialog.addEventListener('cancel', e => {
    e.preventDefault();
  });

  $('restart').addEventListener('click', reset);
  $('play-again').addEventListener('click', reset);

  reset();

  void adHook('showBanner', {
    container: $('ad-banner')
  });
}

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    initializeBlockPuzzle,
    { once: true }
  );
} else {
  initializeBlockPuzzle();
}
