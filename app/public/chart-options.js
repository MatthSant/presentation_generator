/* chart-options.js — buildOptions dinâmico (isDark avaliado em runtime) */
(function (global) {

  function isDark() {
    return document.documentElement.dataset.theme !== 'light';
  }

  function getBase() {
    const dark        = isDark();
    const labelColor  = dark ? '#9CA3AF' : '#9A9AA0';
    const gridColor   = dark ? 'rgba(255,255,255,.06)' : '#ECECEC';
    const tooltipMode = dark ? 'dark' : 'light';
    const defColors   = dark
      ? ['#8B5CF6', '#10B981', '#F59E0B', '#F97316', '#EF4444']
      : ['#6B4FD9', '#0E0E10', '#9A9AA0', '#4A4A50', '#B4322B'];
    const base = {
      chart:       { background: 'transparent', toolbar: { show: false }, animations: { enabled: false } },
      theme:       { mode: dark ? 'dark' : 'light' },
      grid:        { borderColor: gridColor, strokeDashArray: 3 },
      tooltip:     { theme: tooltipMode },
      xaxis:       { labels: { style: { colors: labelColor, fontSize: '11px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis:       { labels: { style: { colors: labelColor, fontSize: '11px' } } },
      dataLabels:  { enabled: false },
      legend:      { labels: { colors: labelColor } },
    };
    return { dark, labelColor, defColors, base };
  }

  function mergeDeep(target, source) {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        target[key] = target[key] || {};
        mergeDeep(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }

  function buildOptions(def) {
    const { dark, labelColor, defColors, base: chartBase } = getBase();
    const b = JSON.parse(JSON.stringify(chartBase));

    const resolvedType = ['mixed', 'stacked'].includes(def.type) ? 'bar'
                       : def.type === 'bar-horizontal' ? 'bar'
                       : def.type;
    const opts = {
      chart:  { ...b.chart, type: resolvedType, height: def.height },
      series: def.series,
      colors: def.colors || defColors,
    };

    if (def.categories) opts.xaxis = { ...b.xaxis, categories: def.categories };
    if (def.labels)     opts.labels = def.labels;

    if (def.type === 'donut' || def.type === 'pie') {
      opts.legend      = { position: 'bottom', labels: { colors: labelColor } };
      opts.plotOptions = { pie: { donut: { size: '65%' } } };
    }
    if (def.type === 'bar' || def.type === 'mixed') {
      opts.plotOptions = { bar: { borderRadius: 2, columnWidth: '55%', ...(def.distributed ? { distributed: true } : {}) } };
      opts.yaxis = { ...b.yaxis, min: 0 };
    }
    if (def.type === 'stacked') {
      opts.chart.stacked = true;
      if (def.stackType) opts.chart.stackType = def.stackType;
      opts.plotOptions = { bar: { borderRadius: 2, columnWidth: '55%' } };
      opts.yaxis = { ...b.yaxis, min: 0 };
    }
    if (def.type === 'bar-horizontal') {
      opts.plotOptions = { bar: { horizontal: true, borderRadius: 2, barHeight: '55%' } };
      opts.yaxis = { labels: { style: { colors: labelColor, fontSize: '11px' } } };
      opts.xaxis = { ...b.xaxis, categories: def.categories, min: 0 };
    }
    if (def.type === 'line') {
      opts.stroke  = { curve: 'smooth', width: 2 };
      opts.markers = { size: 3 };
      opts.yaxis   = { ...b.yaxis, min: 0 };
    }
    if (def.type === 'area') {
      opts.stroke = { curve: 'smooth', width: 2 };
      opts.fill   = { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.2, opacityTo: 0 } };
      opts.yaxis  = { ...b.yaxis, min: 0 };
    }
    if (def.type === 'radialBar') {
      opts.chart.type  = 'radialBar';
      opts.plotOptions = { radialBar: { hollow: { size: '40%' }, dataLabels: {
        name:  { color: labelColor, fontSize: '12px' },
        value: { color: dark ? '#E5E7EB' : '#0E0E10', fontSize: '20px', fontWeight: 700, formatter: v => v + '%' },
      }}};
      opts.legend = { show: true, position: 'bottom', labels: { colors: labelColor } };
    }
    if (def.type === 'scatter') {
      opts.chart.type = 'scatter';
      opts.markers    = { size: 5 };
      opts.xaxis      = { ...b.xaxis, type: 'numeric' };
    }
    if (def.type === 'radar') {
      opts.chart.type = 'radar';
      opts.stroke     = { width: 1.5 };
      opts.fill       = { opacity: 0.1 };
      opts.xaxis      = { categories: def.categories, labels: { style: { colors: Array(def.categories?.length || 6).fill(labelColor), fontSize: '11px' } } };
      opts.yaxis      = { show: false };
    }
    if (def.type === 'treemap') {
      opts.chart.type  = 'treemap';
      opts.plotOptions = { treemap: { distributed: true, enableShades: true, shadeIntensity: 0.3 } };
      opts.legend      = { show: false };
    }

    mergeDeep(opts, { chart: b.chart, grid: b.grid, tooltip: b.tooltip, dataLabels: b.dataLabels });
    if (def.options) mergeDeep(opts, def.options);

    if (Array.isArray(opts.yaxis)) {
      opts.yaxis.forEach(y => { if (y.min === undefined) y.min = 0; });
    } else if (opts.yaxis && opts.yaxis.min === undefined) {
      opts.yaxis.min = 0;
    }
    if (opts.plotOptions?.bar?.horizontal && opts.xaxis && opts.xaxis.min === undefined) {
      opts.xaxis.min = 0;
    }

    return opts;
  }

  global.buildOptions = buildOptions;

})(window);
