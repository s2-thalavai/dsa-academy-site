/*
 * Visualizers: one entry per animation type.
 *
 * Each visualizer turns an input into a list of steps. A step is plain data:
 *   { state, caption, anchor, row? }
 * - state   what the renderer draws (see renderers.array in app.js)
 * - caption one or two sentences describing the step
 * - anchor  the @step:<name> marker in the solution file to highlight
 * - row     optional row for the dry-run table built at compile time
 *
 * This file is shared: the browser uses it to animate, and the build uses it
 * (via node:vm) to print dry-run tables and to test that animations agree
 * with the tested code. Keep it dependency-free and written as a classic
 * script so pages also work from file://.
 */
(function (root) {
  "use strict";

  var visualizers = {};

  // ------------------------------------------------------------ helpers
  function parseIntList(text, min, max) {
    var parts = String(text).split(/[\s,]+/).filter(Boolean);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (!/^-?\d+$/.test(parts[i])) return { error: "“" + parts[i] + "” is not a whole number." };
      var n = parseInt(parts[i], 10);
      if (Math.abs(n) > 999) return { error: "Keep each number between −999 and 999 so it fits in a cell." };
      out.push(n);
    }
    if (out.length < min || out.length > max) return { error: "Enter between " + min + " and " + max + " numbers." };
    return { value: out };
  }
  function parseInt1(text, label) {
    if (!/^\s*-?\d+\s*$/.test(String(text))) return { error: label + " must be a whole number." };
    return { value: parseInt(text, 10) };
  }
  function checkSorted(nums) {
    for (var i = 1; i < nums.length; i++) {
      if (nums[i] < nums[i - 1]) return "This needs sorted input. " + nums[i] + " comes after " + nums[i - 1] + "; sort the numbers and run again.";
    }
    return null;
  }
  function range(a, b) { var o = []; for (var i = a; i <= b; i++) o.push(i); return o; }
  function marksFor(list, cls, into) { into = into || {}; list.forEach(function (i) { into[i] = cls; }); return into; }

  // ------------------------------------------- two pointers: pair sum
  visualizers["two-pointer-sum"] = {
    renderer: "array",
    columns: [{ key: "left", label: "left" }, { key: "right", label: "right" }, { key: "a", label: "numbers[left]" }, { key: "b", label: "numbers[right]" }, { key: "sum", label: "Sum" }, { key: "action", label: "Decision" }],
    inputs: [
      { name: "nums", label: "Sorted numbers", type: "int-list", hint: "2 to 12 whole numbers, smallest first" },
      { name: "target", label: "Target", type: "int", hint: "a whole number" }
    ],
    format: function (input) { return { nums: input.nums.join(", "), target: String(input.target) }; },
    parse: function (raw) {
      var list = parseIntList(raw.nums, 2, 12);
      if (list.error) return list;
      var sortedErr = checkSorted(list.value);
      if (sortedErr) return { error: sortedErr.replace("This needs", "Two pointers needs") };
      var t = parseInt1(raw.target, "The target");
      if (t.error) return t;
      return { value: { nums: list.value, target: t.value } };
    },
    generate: function (input) {
      var a = input.nums, t = input.target;
      var L = 0, R = a.length - 1, out = [], ruledOut = [];
      function state(extra) {
        var marks = marksFor(ruledOut, "out");
        var s = { cells: a.slice(), pointers: { left: L, right: R }, roles: { left: "left", right: "right" }, marks: marks, ruledOut: ruledOut.slice(), found: false, vars: { left: L, right: R } };
        for (var k in extra) s[k] = extra[k];
        if (s.found) { marks[L] = "found"; marks[R] = "found"; }
        else if (!s.none) { marks[L] = "left"; marks[R] = "right"; }
        if (s.none) s.pointers = { left: null, right: null };
        if (s.sum !== undefined) s.vars.sum = s.sum;
        s.vars.target = t;
        if (s.found) s.good = "sum";
        return s;
      }
      out.push({ anchor: "init", caption: "Put left on the smallest number (" + a[L] + ") and right on the largest (" + a[R] + ").", state: state({}) });
      while (L < R) {
        var sum = a[L] + a[R];
        out.push({ anchor: "sum", caption: a[L] + " + " + a[R] + " = " + sum + ". Compare it with the target, " + t + ".", state: state({ sum: sum }) });
        if (sum === t) {
          out.push({
            anchor: "found",
            caption: sum + " equals the target. The answer is positions [" + (L + 1) + ", " + (R + 1) + "], counting from 1.",
            state: state({ found: true, sum: sum }),
            row: { left: L, right: R, a: a[L], b: a[R], sum: sum, action: "Equal: return [" + (L + 1) + ", " + (R + 1) + "]" }
          });
          return out;
        }
        if (sum < t) {
          var row1 = { left: L, right: R, a: a[L], b: a[R], sum: sum, action: "Too small: left moves to " + (L + 1) };
          ruledOut.push(L); L++;
          out.push({ anchor: "move-left", caption: sum + " is less than " + t + ". Even the largest partner can't rescue " + a[L - 1] + ", so rule it out and move left to index " + L + ".", state: state({}), row: row1 });
        } else {
          var row2 = { left: L, right: R, a: a[L], b: a[R], sum: sum, action: "Too big: right moves to " + (R - 1) };
          ruledOut.push(R); R--;
          out.push({ anchor: "move-right", caption: sum + " is greater than " + t + ". Even the smallest partner overshoots with " + a[R + 1] + ", so rule it out and move right to index " + R + ".", state: state({}), row: row2 });
        }
      }
      out.push({ anchor: "none", caption: "The pointers met, so no pair adds up to " + t + ". Return [-1, -1].", state: state({ none: true }) });
      return out;
    }
  };

  // ------------------------------------------------------ binary search
  visualizers["binary-search"] = {
    renderer: "array",
    columns: [{ key: "lo", label: "lo" }, { key: "hi", label: "hi" }, { key: "mid", label: "mid" }, { key: "value", label: "nums[mid]" }, { key: "action", label: "Decision" }],
    inputs: [
      { name: "nums", label: "Sorted numbers", type: "int-list", hint: "1 to 12 whole numbers, smallest first" },
      { name: "target", label: "Find", type: "int", hint: "the value to look for" }
    ],
    format: function (input) { return { nums: input.nums.join(", "), target: String(input.target) }; },
    parse: function (raw) {
      var list = parseIntList(raw.nums, 1, 12);
      if (list.error) return list;
      var sortedErr = checkSorted(list.value);
      if (sortedErr) return { error: sortedErr.replace("This needs", "Binary search needs") };
      var t = parseInt1(raw.target, "The value to find");
      if (t.error) return t;
      return { value: { nums: list.value, target: t.value } };
    },
    generate: function (input) {
      var a = input.nums, t = input.target, n = a.length;
      var lo = 0, hi = n - 1, out = [];
      function state(mid, extra) {
        var marks = {};
        for (var i = 0; i < n; i++) if (i < lo || i > hi) marks[i] = "out";
        if (mid !== null) marks[mid] = extra && extra.found ? "found" : "mid";
        var s = { cells: a.slice(), pointers: { lo: lo <= hi ? lo : null, hi: lo <= hi ? hi : null, mid: mid }, roles: { lo: "left", hi: "right", mid: "mid" }, marks: marks, vars: { lo: lo, hi: hi }, found: false };
        if (mid !== null) s.vars.mid = mid;
        s.vars.target = t;
        for (var k in extra) s[k] = extra[k];
        if (s.found) s.good = "mid";
        return s;
      }
      out.push({ anchor: "init", caption: "The answer, if it exists, is somewhere in indices " + lo + " to " + hi + ". Set lo and hi to the ends.", state: state(null) });
      while (lo <= hi) {
        var mid = lo + Math.floor((hi - lo) / 2);
        out.push({ anchor: "mid", caption: "Look at the middle: index " + mid + " holds " + a[mid] + ".", state: state(mid) });
        if (a[mid] === t) {
          out.push({ anchor: "found", caption: a[mid] + " is the target. Return index " + mid + ".", state: state(mid, { found: true }), row: { lo: lo, hi: hi, mid: mid, value: a[mid], action: "Equal: return " + mid } });
          return out;
        }
        if (a[mid] < t) {
          var r1 = { lo: lo, hi: hi, mid: mid, value: a[mid], action: "Too small: lo = " + (mid + 1) };
          lo = mid + 1;
          out.push({ anchor: "go-right", caption: a[mid] + " is less than " + t + ", so everything from lo to mid is too small. Move lo to " + lo + ".", state: state(null), row: r1 });
        } else {
          var r2 = { lo: lo, hi: hi, mid: mid, value: a[mid], action: "Too big: hi = " + (mid - 1) };
          hi = mid - 1;
          out.push({ anchor: "go-left", caption: a[mid] + " is greater than " + t + ", so everything from mid to hi is too big. Move hi to " + hi + ".", state: state(null), row: r2 });
        }
      }
      out.push({ anchor: "none", caption: "lo passed hi, so the range is empty and " + t + " is not in the array. Return -1.", state: state(null) });
      return out;
    }
  };

  // ------------------------------------- sliding window: best sum of k
  visualizers["sliding-window-sum"] = {
    renderer: "array",
    columns: [{ key: "window", label: "Window" }, { key: "out", label: "Dropped" }, { key: "inn", label: "Added" }, { key: "sum", label: "Window sum" }, { key: "best", label: "Best" }],
    inputs: [
      { name: "nums", label: "Numbers", type: "int-list", hint: "2 to 12 whole numbers" },
      { name: "k", label: "Window size k", type: "int", hint: "1 up to the count of numbers" }
    ],
    format: function (input) { return { nums: input.nums.join(", "), k: String(input.k) }; },
    parse: function (raw) {
      var list = parseIntList(raw.nums, 2, 12);
      if (list.error) return list;
      var k = parseInt1(raw.k, "The window size");
      if (k.error) return k;
      if (k.value < 1 || k.value > list.value.length) return { error: "The window size must be between 1 and " + list.value.length + "." };
      return { value: { nums: list.value, k: k.value } };
    },
    generate: function (input) {
      var a = input.nums, k = input.k, out = [];
      var sum = 0, best = null, bestAt = 0;
      function state(from, to, extra) {
        var s = { cells: a.slice(), pointers: { start: from, end: to }, roles: { start: "left", end: "right" }, marks: {}, window: [from, to], vars: { "window sum": sum, best: best === null ? "–" : best } };
        for (var x in extra) s[x] = extra[x];
        return s;
      }
      for (var i = 0; i < k; i++) sum += a[i];
      best = sum; bestAt = 0;
      out.push({ anchor: "init", caption: "Add up the first " + k + " numbers: the first window sums to " + sum + ". That is the best so far.", state: state(0, k - 1, {}), row: { window: "0–" + (k - 1), out: "–", inn: "–", sum: sum, best: best } });
      for (var end = k; end < a.length; end++) {
        var start = end - k + 1;
        var leaving = a[start - 1];
        sum += a[end] - leaving;
        var marks = {}; marks[start - 1] = "out"; marks[end] = "new";
        var improved = sum > best;
        if (improved) { best = sum; bestAt = start; }
        out.push({
          anchor: "slide",
          caption: "Slide right: add " + a[end] + " and drop " + leaving + ". The new window sums to " + sum + (improved ? ", the best so far." : ", not better than " + best + "."),
          state: state(start, end, { marks: marks, good: improved ? "best" : undefined }),
          row: { window: start + "–" + end, out: leaving, inn: a[end], sum: sum, best: best }
        });
      }
      var done = {}; range(bestAt, bestAt + k - 1).forEach(function (i) { done[i] = "found"; });
      out.push({ anchor: "done", caption: "Every window was checked once. The best sum is " + best + ", from index " + bestAt + " to " + (bestAt + k - 1) + ".", state: state(bestAt, bestAt + k - 1, { marks: done, good: "best", best: best }) });
      return out;
    }
  };

  // ------------------------------------------- array insert (shifting)
  visualizers["array-insert"] = {
    renderer: "array",
    inputs: [
      { name: "nums", label: "Numbers", type: "int-list", hint: "1 to 10 whole numbers" },
      { name: "index", label: "Insert at index", type: "int", hint: "0 up to the count of numbers" },
      { name: "value", label: "Value", type: "int", hint: "a whole number" }
    ],
    format: function (input) { return { nums: input.nums.join(", "), index: String(input.index), value: String(input.value) }; },
    parse: function (raw) {
      var list = parseIntList(raw.nums, 1, 10);
      if (list.error) return list;
      var idx = parseInt1(raw.index, "The index");
      if (idx.error) return idx;
      if (idx.value < 0 || idx.value > list.value.length) return { error: "The index must be between 0 and " + list.value.length + "." };
      var v = parseInt1(raw.value, "The value");
      if (v.error) return v;
      if (Math.abs(v.value) > 999) return { error: "Keep the value between −999 and 999." };
      return { value: { nums: list.value, index: idx.value, value: v.value } };
    },
    generate: function (input) {
      var cells = input.nums.slice(), at = input.index, val = input.value, out = [];
      cells.push(null);
      var size = input.nums.length, moves = 0;
      function state(i, marks) {
        return { cells: cells.slice(), pointers: { i: i }, roles: { i: "mid" }, marks: marks || {}, vars: { size: size, moves: moves } };
      }
      out.push({ anchor: "grow", caption: "To insert " + val + " at index " + at + ", the array needs one free slot at the end. Every element from index " + at + " onward must move right by one.", state: state(null, (function () { var m = {}; m[size] = "new"; return m; })()) });
      for (var i = size; i > at; i--) {
        cells[i] = cells[i - 1];
        moves++;
        var m = {}; m[i] = "new"; m[i - 1] = "out";
        out.push({ anchor: "shift", caption: "Copy index " + (i - 1) + " into index " + i + " (value " + cells[i] + "). Moves so far: " + moves + ".", state: state(i, m) });
      }
      cells[at] = val; size++;
      var w = {}; w[at] = "found";
      out.push({ anchor: "write", caption: "Index " + at + " is free now. Write " + val + " there.", state: state(at, w) });
      var d = {}; range(0, size - 1).forEach(function (j) { d[j] = "done"; }); d[at] = "found";
      out.push({ anchor: "done", caption: "Done after " + moves + " move" + (moves === 1 ? "" : "s") + ". Inserting at the front of n items moves all n, which is why insertion is O(n).", state: state(null, d) });
      return out;
    }
  };

  // --------------------------------------------- prefix sum and query
  visualizers["prefix-sum"] = {
    renderer: "array",
    inputs: [
      { name: "nums", label: "Numbers", type: "int-list", hint: "2 to 10 whole numbers" },
      { name: "l", label: "Query from", type: "int", hint: "start index" },
      { name: "r", label: "Query to", type: "int", hint: "end index" }
    ],
    format: function (input) { return { nums: input.nums.join(", "), l: String(input.l), r: String(input.r) }; },
    parse: function (raw) {
      var list = parseIntList(raw.nums, 2, 10);
      if (list.error) return list;
      var l = parseInt1(raw.l, "The start index"); if (l.error) return l;
      var r = parseInt1(raw.r, "The end index"); if (r.error) return r;
      if (l.value < 0 || r.value >= list.value.length || l.value > r.value) return { error: "Choose 0 ≤ from ≤ to ≤ " + (list.value.length - 1) + "." };
      return { value: { nums: list.value, l: l.value, r: r.value } };
    },
    generate: function (input) {
      var a = input.nums, n = a.length, out = [];
      var cells = a.slice();
      function state(marks, vars, ptrs) {
        return { cells: cells.slice(), pointers: Object.assign({ i: null, l: null, r: null }, ptrs || {}), roles: { i: "mid", l: "left", r: "right" }, marks: marks || {}, vars: vars || {} };
      }
      out.push({ anchor: "init", caption: "prefix[i] will hold the sum of everything up to index i. prefix[0] is just " + a[0] + ".", state: state({ 0: "new" }, { "prefix[0]": a[0] }, { i: 0 }) });
      for (var i = 1; i < n; i++) {
        cells[i] = cells[i - 1] + a[i];
        var m = {}; m[i] = "new";
        var vars = {}; vars["prefix[" + i + "]"] = (cells[i - 1]) + " + " + a[i] + " = " + cells[i];
        out.push({ anchor: "add", caption: "prefix[" + i + "] = prefix[" + (i - 1) + "] + nums[" + i + "] = " + cells[i - 1] + " + " + a[i] + " = " + cells[i] + ".", state: state(m, vars, { i: i }) });
      }
      var l = input.l, r = input.r;
      var left = l > 0 ? cells[l - 1] : 0, ans = cells[r] - left;
      var qm = {}; qm[r] = "found"; if (l > 0) qm[l - 1] = "out";
      var qv = {}; qv["sum(" + l + ".." + r + ")"] = cells[r] + " − " + left + " = " + ans;
      out.push({
        anchor: "query",
        caption: "Any range sum is now one subtraction: sum(" + l + ".." + r + ") = prefix[" + r + "]" + (l > 0 ? " − prefix[" + (l - 1) + "]" : "") + " = " + ans + ".",
        state: state(qm, qv, { i: null, l: l > 0 ? l - 1 : null, r: r })
      });
      return out;
    }
  };

  root.DSAVisualizers = visualizers;
})(typeof window !== "undefined" ? window : globalThis);
