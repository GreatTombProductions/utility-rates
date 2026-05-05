/**
 * Utility Rate Check — Client-side application
 *
 * Loads prebuilt JSON data and provides instant zip code → rate comparison.
 * No backend required. All data served as static files.
 */

(function() {
    'use strict';

    // State
    let zipData = null;
    let utilData = null;
    let avgData = null;
    let selectedUtility = null;
    let currentZip = null;

    // DOM refs
    const zipInput = document.getElementById('zip-input');
    const searchBtn = document.getElementById('search-btn');
    const searchHint = document.getElementById('search-hint');
    const pickerSection = document.getElementById('picker-section');
    const pickerList = document.getElementById('picker-list');
    const resultsSection = document.getElementById('results-section');
    const loadingEl = document.getElementById('loading');

    // ── Data Loading ──────────────────────────────────────────────

    async function loadData() {
        loadingEl.classList.remove('hidden');
        try {
            const [zipResp, utilResp, avgResp] = await Promise.all([
                fetch('data/zip_lookup.json'),
                fetch('data/utilities.json'),
                fetch('data/averages.json'),
            ]);
            zipData = await zipResp.json();
            utilData = await utilResp.json();
            avgData = await avgResp.json();
            loadingEl.classList.add('hidden');
            zipInput.focus();
        } catch (e) {
            loadingEl.textContent = 'Failed to load data. Please refresh.';
            console.error('Data load error:', e);
        }
    }

    // ── Formatting ────────────────────────────────────────────────

    function fmtRate(rate) {
        return (rate * 100).toFixed(1) + '\u00a2';
    }

    function fmtRateFull(rate) {
        return '$' + rate.toFixed(4);
    }

    function fmtMonthly(rate) {
        const monthly = rate * 900;
        return '~$' + Math.round(monthly) + '/mo';
    }

    function fmtDiff(yourRate, otherRate) {
        const diff = ((yourRate - otherRate) / otherRate * 100);
        if (Math.abs(diff) < 0.5) return { text: 'same', cls: 'diff-zero' };
        const sign = diff > 0 ? '+' : '';
        return {
            text: sign + diff.toFixed(0) + '%',
            cls: diff > 0 ? 'diff-positive' : 'diff-negative',
        };
    }

    function pctToWord(pct) {
        if (pct <= 15) return 'among the lowest';
        if (pct <= 35) return 'below average';
        if (pct <= 65) return 'near average';
        if (pct <= 85) return 'above average';
        return 'among the highest';
    }

    // ── Search ────────────────────────────────────────────────────

    function doSearch() {
        const raw = zipInput.value.trim();
        const zip = raw.padStart(5, '0');

        if (!/^\d{5}$/.test(zip)) {
            showHint('Enter a 5-digit zip code', true);
            return;
        }

        const entries = zipData[zip];
        if (!entries) {
            showHint('No utility data found for zip ' + zip, true);
            pickerSection.classList.add('hidden');
            resultsSection.classList.add('hidden');
            return;
        }

        currentZip = zip;
        showHint('');
        resultsSection.classList.add('hidden');

        if (entries.length === 1) {
            pickerSection.classList.add('hidden');
            selectUtility(entries[0], zip);
        } else {
            showPicker(entries, zip);
        }
    }

    function showHint(msg, isError) {
        searchHint.textContent = msg;
        searchHint.className = 'search-hint' + (isError ? ' error' : '');
    }

    // ── Picker ────────────────────────────────────────────────────

    function showPicker(entries, zip) {
        pickerList.innerHTML = '';
        entries.forEach(function(e) {
            const item = document.createElement('div');
            item.className = 'picker-item';
            item.innerHTML =
                '<span class="picker-item-name">' + escHtml(e.n) + '</span>' +
                '<span class="picker-item-meta">' +
                    '<span>' + escHtml(e.o) + '</span>' +
                    '<span class="picker-item-rate">' + fmtRate(e.r) + '/kWh</span>' +
                '</span>';
            item.addEventListener('click', function() { selectUtility(e, zip); });
            pickerList.appendChild(item);
        });
        pickerSection.classList.remove('hidden');
    }

    // ── Results ───────────────────────────────────────────────────

    function selectUtility(entry, zip) {
        selectedUtility = entry;
        const util = utilData[String(entry.id)];
        if (!util) return;

        const rate = entry.r;
        const state = util.s[0];
        const stateAvg = avgData.states[state] || avgData.national;
        const nationalAvg = avgData.national;

        // Header
        document.getElementById('utility-name').textContent = entry.n;
        document.getElementById('ownership-badge').textContent = entry.o;

        // Rate cards
        document.getElementById('your-rate').textContent = fmtRate(rate) + '/kWh';
        document.getElementById('your-rate-monthly').textContent = fmtMonthly(rate);

        document.getElementById('state-label').textContent = state + ' Average';
        document.getElementById('state-rate').textContent = fmtRate(stateAvg) + '/kWh';
        document.getElementById('state-rate-monthly').textContent = fmtMonthly(stateAvg);

        document.getElementById('national-rate').textContent = fmtRate(nationalAvg) + '/kWh';
        document.getElementById('national-rate-monthly').textContent = fmtMonthly(nationalAvg);

        // Rate bar
        renderRateBar(rate, stateAvg, nationalAvg, state);

        // Context text
        renderContext(rate, stateAvg, nationalAvg, state, util);

        // Nearby table
        renderNearby(entry.id, rate, state);

        // Other utilities in this zip
        renderZipOthers(zip, entry.id);

        resultsSection.classList.remove('hidden');
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function renderRateBar(rate, stateAvg, nationalAvg, state) {
        // Scale: use full state range from utilities data
        const stateUtils = [];
        for (var id in utilData) {
            var u = utilData[id];
            if (u.s.indexOf(state) !== -1) stateUtils.push(u.r);
        }
        stateUtils.sort(function(a, b) { return a - b; });

        var min = stateUtils[0] || 0.03;
        var max = stateUtils[stateUtils.length - 1] || 0.50;
        // Add 5% padding
        var range = max - min;
        min = Math.max(0, min - range * 0.05);
        max = max + range * 0.05;

        function pct(v) {
            return Math.max(2, Math.min(98, ((v - min) / (max - min)) * 100));
        }

        document.getElementById('your-marker').style.left = pct(rate) + '%';
        document.getElementById('state-marker').style.left = pct(stateAvg) + '%';
        document.getElementById('state-marker-label').textContent = state;
        document.getElementById('national-marker').style.left = pct(nationalAvg) + '%';

        document.getElementById('bar-min').textContent = fmtRate(min);
        document.getElementById('bar-max').textContent = fmtRate(max);
    }

    function renderContext(rate, stateAvg, nationalAvg, state, util) {
        var pieces = [];
        var stateRank = util.sr;
        var stateTotal = util.st;
        var statePct = util.sp;

        // vs state
        var stDiff = ((rate - stateAvg) / stateAvg * 100);
        var stDir = stDiff > 0 ? 'above' : 'below';
        var stCls = stDiff > 0 ? 'high' : 'low';

        if (Math.abs(stDiff) < 2) {
            pieces.push('Your rate is <span class="highlight">right at the ' + state + ' average</span>.');
        } else {
            pieces.push('Your rate is <span class="' + stCls + '">' +
                Math.abs(stDiff).toFixed(0) + '% ' + stDir +
                '</span> the ' + state + ' average.');
        }

        // rank
        pieces.push('Ranked <span class="highlight">#' + stateRank + ' of ' + stateTotal +
            '</span> utilities in ' + state + ' (' + pctToWord(statePct) + ').');

        // vs national
        var nDiff = ((rate - nationalAvg) / nationalAvg * 100);
        if (Math.abs(nDiff) >= 5) {
            var nDir = nDiff > 0 ? 'above' : 'below';
            var nCls = nDiff > 0 ? 'high' : 'low';
            pieces.push('<span class="' + nCls + '">' +
                Math.abs(nDiff).toFixed(0) + '% ' + nDir +
                '</span> the national average.');
        }

        // monthly cost difference
        var monthlyDiff = (rate - stateAvg) * 900;
        if (Math.abs(monthlyDiff) >= 2) {
            var sign = monthlyDiff > 0 ? 'more' : 'less';
            var mCls = monthlyDiff > 0 ? 'high' : 'low';
            pieces.push('That\'s roughly <span class="' + mCls + '">$' +
                Math.abs(Math.round(monthlyDiff)) + '/month ' + sign +
                '</span> than the state average for a typical household (900 kWh/mo).');
        }

        document.getElementById('context-text').innerHTML = pieces.join(' ');
    }

    function renderNearby(selectedId, yourRate, state) {
        // Get all utilities in this state, sorted by rate
        var stateUtils = [];
        for (var id in utilData) {
            var u = utilData[id];
            if (u.s.indexOf(state) !== -1) {
                stateUtils.push({ id: parseInt(id), name: u.n, ownership: u.o, rate: u.r });
            }
        }
        stateUtils.sort(function(a, b) { return a.rate - b.rate; });

        // Find the selected utility's position and show a window around it
        var idx = stateUtils.findIndex(function(u) { return u.id === selectedId; });
        var windowSize = 10;
        var start = Math.max(0, idx - windowSize);
        var end = Math.min(stateUtils.length, idx + windowSize + 1);
        var visible = stateUtils.slice(start, end);

        var tbody = document.getElementById('nearby-body');
        tbody.innerHTML = '';
        visible.forEach(function(u) {
            var tr = document.createElement('tr');
            if (u.id === selectedId) tr.className = 'is-you';
            var diff = fmtDiff(u.rate, yourRate);
            tr.innerHTML =
                '<td>' + escHtml(u.name) + '</td>' +
                '<td>' + escHtml(u.ownership) + '</td>' +
                '<td>' + fmtRate(u.rate) + '/kWh</td>' +
                '<td class="' + diff.cls + '">' + diff.text + '</td>';
            tbody.appendChild(tr);
        });

        document.getElementById('nearby-state').textContent = state;

        var hint = '';
        if (stateUtils.length > visible.length) {
            hint = 'Showing ' + visible.length + ' of ' + stateUtils.length + ' utilities in ' + state + '.';
        }
        document.getElementById('nearby-hint').textContent = hint;

        document.getElementById('nearby-section').classList.remove('hidden');
    }

    function renderZipOthers(zip, selectedId) {
        var entries = zipData[zip];
        if (!entries || entries.length <= 1) {
            document.getElementById('zip-others-section').classList.add('hidden');
            return;
        }

        var others = entries.filter(function(e) { return e.id !== selectedId; });
        if (others.length === 0) {
            document.getElementById('zip-others-section').classList.add('hidden');
            return;
        }

        document.getElementById('zip-others-zip').textContent = zip;
        var list = document.getElementById('zip-others-list');
        list.innerHTML = '';

        others.forEach(function(e) {
            var item = document.createElement('div');
            item.className = 'zip-other-item';
            item.innerHTML =
                '<span class="zip-other-name">' + escHtml(e.n) +
                ' <span style="color:var(--text-dim);font-size:0.75rem">(' + escHtml(e.o) + ')</span></span>' +
                '<span class="zip-other-rate">' + fmtRate(e.r) + '/kWh</span>';
            item.addEventListener('click', function() {
                selectUtility(e, zip);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
            list.appendChild(item);
        });

        document.getElementById('zip-others-section').classList.remove('hidden');
    }

    // ── Util ──────────────────────────────────────────────────────

    function escHtml(s) {
        var div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    // ── Events ────────────────────────────────────────────────────

    searchBtn.addEventListener('click', doSearch);
    zipInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') doSearch();
    });

    // Filter non-numeric input
    zipInput.addEventListener('input', function() {
        this.value = this.value.replace(/[^0-9]/g, '');
    });

    // ── Init ──────────────────────────────────────────────────────

    loadData();

})();
