"use strict";

// Fibonacci
function fibSeries(n) {
  if (n === 0) return [];
  if (n === 1) return [0];
  const out = [0, 1];
  while (out.length < n) {
    out.push(out[out.length - 1] + out[out.length - 2]);
  }
  return out;
}

// Prime helpers
function isPrime(x) {
  if (!Number.isInteger(x) || x < 2) return false;
  if (x === 2 || x === 3) return true;
  if (x % 2 === 0) return false;
  for (let i = 3; i * i <= x; i += 2) {
    if (x % i === 0) return false;
  }
  return true;
}

function primesFromList(arr) {
  return arr.filter(isPrime);
}

// GCD / HCF
function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

function hcfList(nums) {
  let result = nums[0];
  for (let i = 1; i < nums.length; i++) {
    result = gcd(result, nums[i]);
  }
  return Math.abs(result);
}

// LCM
function lcmTwo(a, b) {
  if (a === 0 || b === 0) return 0;
  return Math.abs((a / gcd(a, b)) * b);
}

function lcmList(nums) {
  let result = nums[0];
  for (let i = 1; i < nums.length; i++) {
    result = lcmTwo(result, nums[i]);
  }
  return result;
}

module.exports = {
  fibSeries,
  primesFromList,
  lcmList,
  hcfList
};
