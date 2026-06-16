// test.ts — intentional ESLint violations for testing

import { add } from './test.js'

var unused: string = 'unused variable with var'

let greeting: string

function double(x: number) {
  return x * 2
}

console.log(add(1, 2))

interface User {
  name: string
  age: number
}

const user: User = { name: 'Alice', age: 30 }
console.log(user)

export { double }
