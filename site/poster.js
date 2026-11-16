(function (root) {
  const T = root.Timetable;

  const SERIF = '"Instrument Serif", Georgia, serif';
  const SANS = '"Geist", system-ui, sans-serif';
  const MONO = '"Geist Mono", ui-monospace, Consolas, monospace';

  const SCALE = 2;
  const WIDTH = 1600;
  const MARGIN = 72;
  const TIME_COLUMN = 78;
  const HEAD = 44;
  const ROW = 80;
  const GRID_TOP = 368;

  const rgb = (hex) => {
    const value = parseInt(hex.slice(1), 16);
    return [value >> 16, (value >> 8) & 255, value & 255];
  };

  const mix = (hex, base, amount) => {
    const from = rgb(hex);
    const to = rgb(base);
    return `rgb(${from.map((channel, index) => Math.round(channel * amount + to[index] * (1 - amount))).join(',')})`;
  };

  function readPalette() {
    const style = getComputedStyle(document.documentElement);
    const token = (name) => style.getPropertyValue(name).trim();
    const paper = token('--paper');
    const ink = token('--ink');
    return {
      paper,
      ink,
      muted: token('--ink-2'),
      line: mix(ink, paper, 0.16),
      hues: [0, 1, 2, 3, 4].map((index) => token(`--m${index}`)),
    };
  }

  function createPen(ctx) {
    const set = ({ font, color, align = 'left', spacing = 0, alpha = 1 }) => {
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.letterSpacing = `${spacing}px`;
      ctx.globalAlpha = alpha;
    };
    return {
      write(value, x, y, style) {
        set(style);
        ctx.fillText(value, x, y);
        ctx.globalAlpha = 1;
      },
      width(value, style) {
        set(style);
        ctx.globalAlpha = 1;
        return ctx.measureText(value).width;
      },
      fit(value, maxWidth, style) {
        if (this.width(value, style) <= maxWidth) return value;
        let cut = value;
        while (cut.length > 1 && this.width(`${cut}…`, style) > maxWidth) cut = cut.slice(0, -1);
        return `${cut.trimEnd()}…`;
      },
      wrap(value, maxWidth, style) {
        const lines = [''];
        for (const word of value.split(' ')) {
          const candidate = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${word}` : word;
          if (this.width(candidate, style) <= maxWidth || !lines[lines.length - 1]) lines[lines.length - 1] = candidate;
          else lines.push(word);
        }
        return lines;
      },
    };
  }

  function drawDots(ctx, session, right, centerY, color) {
    const size = 7;
    const gap = 4;
    const left = right - (T.groups.length * size + (T.groups.length - 1) * gap);
    T.groups.forEach((group, index) => {
      const on = session ? session.groups.includes(group) : index < 3;
      ctx.beginPath();
      ctx.arc(left + index * (size + gap) + size / 2, centerY, on ? size / 2 : size / 2 - 0.6, 0, Math.PI * 2);
      ctx.globalAlpha = on ? 1 : 0.45;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      if (on) ctx.fill();
      else ctx.stroke();
      ctx.globalAlpha = 1;
    });
    return left;
  }

  function drawSurface(ctx, palette, kind, hue, x, y, w, h, radius) {
    const outline = () => {
      ctx.beginPath();
      ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, radius);
    };
    if (kind === 'lecture') {
      outline();
      ctx.fillStyle = hue;
      ctx.fill();
      return;
    }
    if (kind === 'tutorial') {
      outline();
      ctx.fillStyle = mix(hue, palette.paper, 0.14);
      ctx.fill();
      ctx.strokeStyle = mix(hue, palette.paper, 0.42);
      ctx.lineWidth = 1;
      ctx.stroke();
      return;
    }
    ctx.save();
    outline();
    ctx.clip();
    ctx.strokeStyle = mix(hue, palette.paper, 0.26);
    ctx.lineWidth = 1;
    for (let offset = 0; offset < w + h; offset += 9.9) {
      ctx.beginPath();
      ctx.moveTo(x + offset, y);
      ctx.lineTo(x + offset - h, y + h);
      ctx.stroke();
    }
    ctx.restore();
    outline();
    ctx.strokeStyle = mix(hue, palette.paper, 0.6);
    ctx.stroke();
  }

  function drawTile(ctx, pen, palette, session, x, y, w, h) {
    const hue = palette.hues[session.hue];
    const solid = session.kind === 'lecture';
    const text = solid ? palette.paper : palette.ink;
    const codeColor = solid ? palette.paper : mix(hue, palette.ink, 0.86);
    const pad = 16;
    const inner = w - pad * 2;
    drawSurface(ctx, palette, session.kind, hue, x, y, w, h, 9);

    const codeStyle = { font: `600 19px ${MONO}`, color: codeColor, spacing: -0.2 };
    pen.write(session.module, x + pad, y + 34, codeStyle);
    if (session.variant) {
      const tagStyle = { font: `600 10.5px ${MONO}`, color: codeColor, spacing: 0.6 };
      const tagX = x + pad + pen.width(session.module, codeStyle) + 9;
      const tagWidth = pen.width(session.variant, tagStyle) + 11;
      ctx.beginPath();
      ctx.roundRect(tagX + 0.5, y + 17.5, tagWidth, 18, 4.5);
      ctx.strokeStyle = codeColor;
      ctx.lineWidth = 1;
      ctx.stroke();
      pen.write(session.variant, tagX + 6, y + 30.5, tagStyle);
    }
    drawDots(ctx, session, x + w - pad, y + 27, text);

    if (session.hours > 1) {
      const kindStyle = { font: `400 15px ${SANS}`, color: text, alpha: 0.86 };
      pen.wrap(session.kindLabel, inner, kindStyle)
        .slice(0, 2)
        .forEach((line, index) => pen.write(line, x + pad, y + 58 + index * 20, kindStyle));
    }

    const staff = session.staff.length > 3 ? `${session.staff.slice(0, 3).join(', ')} +${session.staff.length - 3}` : session.staff.join(', ');
    const where = [session.place, staff].filter(Boolean).join(' · ');
    const metaStyle = { font: `400 13px ${MONO}`, color: text };
    pen.write(session.time, x + pad, y + h - 36, metaStyle);
    pen.write(pen.fit(where, inner, metaStyle), x + pad, y + h - 16, { ...metaStyle, alpha: 0.82 });
  }

  function drawLegend(ctx, pen, palette, y) {
    const label = { font: `400 12px ${MONO}`, color: palette.muted, spacing: 0.2 };
    let x = MARGIN;
    for (const [kind, name] of [['lecture', 'Lecture'], ['tutorial', 'Tutorial'], ['session', 'Other session']]) {
      drawSurface(ctx, palette, kind, palette.ink, x, y - 12, 15, 15, 4);
      pen.write(name, x + 24, y, label);
      x += 24 + pen.width(name, label) + 30;
    }
    const dotsLeft = x;
    drawDots(ctx, null, dotsLeft + 51, y - 4.5, palette.muted);
    pen.write(`Groups in the room, ${T.groups[0]} to ${T.groups[T.groups.length - 1]}`, dotsLeft + 61, y, label);
  }

  async function renderPoster(group) {
    const fonts = [`400 250px ${SERIF}`, `italic 400 64px ${SERIF}`, `400 15px ${SANS}`, `400 13px ${MONO}`, `500 13px ${MONO}`, `600 19px ${MONO}`];
    await Promise.all(fonts.map((font) => document.fonts.load(font))).catch(() => {});

    const palette = readPalette();
    const own = T.sessionsFor(group);
    const lanesTop = GRID_TOP + HEAD;
    const lanesHeight = T.hourCount * ROW;
    const footerY = lanesTop + lanesHeight + 58;
    const height = footerY + 60;
    const laneLeft = MARGIN + TIME_COLUMN;
    const laneWidth = (WIDTH - MARGIN - laneLeft) / T.days.length;

    const canvas = document.createElement('canvas');
    canvas.width = WIDTH * SCALE;
    canvas.height = height * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    const pen = createPen(ctx);

    const rule = (x1, y1, x2, y2, color = palette.line, width = 1) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };

    ctx.fillStyle = palette.paper;
    ctx.fillRect(0, 0, WIDTH, height);

    const eyebrow = { font: `500 13px ${MONO}`, color: palette.muted, spacing: 2 };
    pen.write(T.data.institution.toUpperCase(), MARGIN, MARGIN + 12, eyebrow);
    pen.write(`${T.data.cohort.toUpperCase()} · SEMESTER 1`, WIDTH - MARGIN, MARGIN + 12, { ...eyebrow, align: 'right' });
    rule(MARGIN, MARGIN + 34.5, WIDTH - MARGIN, MARGIN + 34.5);

    const baseline = 312;
    const wordStyle = { font: `italic 400 64px ${SERIF}`, color: palette.muted };
    pen.write('Group', MARGIN, baseline, wordStyle);
    pen.write(group, MARGIN + pen.width('Group', wordStyle) + 24, baseline, { font: `400 250px ${SERIF}`, color: palette.ink });

    const stats = T.summarise(group);
    const statWidth = 196;
    stats.forEach((stat, index) => {
      const x = WIDTH - MARGIN - statWidth * (stats.length - index) + 26;
      if (index > 0) rule(x - 26.5, baseline - 76, x - 26.5, baseline + 2);
      pen.write(stat.value, x, baseline - 28, { font: `400 54px ${SERIF}`, color: palette.ink });
      pen.write(stat.label.toUpperCase(), x, baseline - 2, { font: `500 11px ${MONO}`, color: palette.muted, spacing: 1.2 });
    });

    T.days.forEach((day, index) => {
      const x = laneLeft + index * laneWidth;
      pen.write(day.name.toUpperCase(), x + 12, GRID_TOP + 26, { font: `500 12px ${MONO}`, color: palette.muted, spacing: 2 });
      rule(x + 0.5, lanesTop, x + 0.5, lanesTop + lanesHeight);
    });
    rule(WIDTH - MARGIN - 0.5, lanesTop, WIDTH - MARGIN - 0.5, lanesTop + lanesHeight);

    for (let hour = 0; hour <= T.hourCount; hour += 1) {
      const y = lanesTop + hour * ROW;
      rule(laneLeft, y + 0.5, WIDTH - MARGIN, y + 0.5);
      pen.write(T.clock(T.dayStart + hour * 60), laneLeft - 14, y + 4.5, { font: `400 12px ${MONO}`, color: palette.muted, align: 'right' });
    }

    for (const session of own) {
      const column = T.days.findIndex((day) => day.index === session.day);
      drawTile(
        ctx,
        pen,
        palette,
        session,
        laneLeft + column * laneWidth + 6,
        lanesTop + ((session.start - T.dayStart) / 60) * ROW + 5,
        laneWidth - 11,
        session.hours * ROW - 9,
      );
    }

    drawLegend(ctx, pen, palette, footerY);
    pen.write(`Source: ${T.data.generated}`, WIDTH - MARGIN, footerY, {
      font: `400 12px ${MONO}`,
      color: palette.muted,
      align: 'right',
      spacing: 0.2,
    });

    return canvas;
  }

  T.renderPoster = renderPoster;
})(globalThis);
