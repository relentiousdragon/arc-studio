import { Parser } from "expr-eval";
const parser = new Parser();

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
//
export function evaluateMathNode(type, inputs, data = {}) {
  const a = number(inputs.a);
  const b = number(inputs.b);
  let result;
  switch (type) {
    case 'math_add': result = a + b; break;
    case 'math_subtract': result = a - b; break;
    case 'math_multiply': result = a * b; break;
    case 'math_divide': result = b === 0 ? 0 : a / b; break;
    case 'math_modulo': result = b === 0 ? 0 : a % b; break;
    case 'math_power': result = Math.pow(a, b); break;
    case 'math_min': result = Math.min(a, b); break;
    case 'math_max': result = Math.max(a, b); break;
    case 'math_abs': result = Math.abs(number(inputs.value)); break;
    case 'math_sqrt': result = Math.sqrt(Math.max(0, number(inputs.value))); break;
    case 'math_sin': result = Math.sin(number(inputs.value)); break;
    case 'math_cos': result = Math.cos(number(inputs.value)); break;
    case 'math_tan': result = Math.tan(number(inputs.value)); break;
    case 'math_asin': result = Math.asin(Math.max(-1, Math.min(1, number(inputs.value)))); break;
    case 'math_acos': result = Math.acos(Math.max(-1, Math.min(1, number(inputs.value)))); break;
    case 'math_atan': result = Math.atan(number(inputs.value)); break;
    case 'math_log': result = number(inputs.value) <= 0 ? 0 : Math.log(number(inputs.value)); break;
    case 'math_log10': result = number(inputs.value) <= 0 ? 0 : Math.log10(number(inputs.value)); break;
    case 'math_exp': result = Math.exp(number(inputs.value)); break;
    case 'math_sign': result = Math.sign(number(inputs.value)); break;
    case 'math_round': {
      const precision = Math.max(0, Math.min(12, Math.trunc(number(data.precision))));
      const factor = 10 ** precision;
      result = Math.round(number(inputs.value) * factor) / factor;
      break;
    }
    case 'math_floor': result = Math.floor(number(inputs.value)); break;
    case 'math_ceil': result = Math.ceil(number(inputs.value)); break;
    case 'math_clamp': {
      const lower = Math.min(number(inputs.min), number(inputs.max));
      const upper = Math.max(number(inputs.min), number(inputs.max));
      result = Math.max(lower, Math.min(upper, number(inputs.value)));
      break;
    }
    case 'math_sum': {
      const values = [...'abcd'].map((key) => inputs[key]).concat(Array.from({ length: 46 }, (_, index) => inputs[`value_${index + 5}`]));
      result = values.reduce((total, value) => total + number(value), 0);
      break;
    }
    case 'math_average': {
      const values = [...'abcd'].map((key) => inputs[key]).concat(Array.from({ length: 46 }, (_, index) => inputs[`value_${index + 5}`])).filter((value) => value !== undefined);
      result = values.length ? values.reduce((total, value) => total + number(value), 0) / values.length : 0;
      break;
    }
    case 'math_lerp': result = number(inputs.a) + (number(inputs.b) - number(inputs.a)) * Math.max(0, Math.min(1, number(inputs.t))); break;
    case 'math_constant': result = ({ pi: Math.PI, tau: Math.PI * 2, e: Math.E, golden_ratio: (1 + Math.sqrt(5)) / 2, sqrt_two: Math.SQRT2 })[data.constant || 'pi'] ?? Math.PI; break;
    case 'math_compare': {
      const compare = {
        less_than: () => a < b,
        less_or_equal: () => a <= b,
        equal: () => a === b,
        not_equal: () => a !== b,
        greater_or_equal: () => a >= b,
        greater_than: () => a > b
      };
      return compare[data.operation]?.() ?? false;
    }
    case 'math_random': {
      const lower = Math.min(number(inputs.min), number(inputs.max));
      const upper = Math.max(number(inputs.min), number(inputs.max));
      result = lower + Math.random() * (upper - lower);
      break;
    }
    case 'math_eval': {
      try {

        const expr = parser.parse(inputs.expression);
        const result = expr.evaluate();
        return { result: result, valid: Number.isFinite(result) }
      } catch { return { result: 0, valid: false } }
      break;
    }
    default: return 0;
  }
  return Number.isFinite(result) ? result : 0;
}
