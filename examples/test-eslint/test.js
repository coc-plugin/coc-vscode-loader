// test.js — intentional ESLint violations for testing

const unusedVar = 'this should trigger no-unused-vars and no-var'

const x = 1

console.log('this should trigger no-console warning')

function add (a, b) {
  const result = a + b
  return result
}

const double = (n) => {
  return n * 2
}

if (x == '1') {
}

export { add, double }
