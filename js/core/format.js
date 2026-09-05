/* ============================================================
   ProtoMacro — core/format.js
   Unit conversion + display formatting.
   STORAGE IS ALWAYS METRIC (kg, cm, ml). Conversion happens at
   the display/input boundary only, driven by STATE.settings.units.
   ============================================================ */

const KG_PER_LB = 0.45359237;
const ML_PER_OZ = 29.5735295625;
const CM_PER_IN = 2.54;

export const kgToLb = (kg) => kg / KG_PER_LB;
export const lbToKg = (lb) => lb * KG_PER_LB;
export const mlToOz = (ml) => ml / ML_PER_OZ;
export const ozToMl = (oz) => oz * ML_PER_OZ;
export const cmToFeetInches = (cm) => {
  const totalIn = cm / CM_PER_IN;
  const feet = Math.floor(totalIn / 12);
  const inches = Math.round((totalIn - feet * 12) * 10) / 10;
  if (inches >= 12) return { feet: feet + 1, inches: 0 };
  return { feet, inches };
};
export const ftInToCm = (feet, inches) => (feet * 12 + inches) * CM_PER_IN;

/* ---------- weight ---------- */

export const weightUnit = (units) => (units?.weight === 'lb' ? 'lb' : 'kg');
export const formatWeight = (kg, units, decimals = 1) =>
  `${(weightUnit(units) === 'lb' ? kgToLb(kg) : kg).toFixed(decimals)}`;
export const parseWeightToKg = (input, units) => {
  const n = parseFloat(input);
  if (!Number.isFinite(n)) return null;
  return weightUnit(units) === 'lb' ? lbToKg(n) : n;
};

/* ---------- height ---------- */

export const formatHeight = (cm, units) => {
  if (units?.height === 'ft') {
    const { feet, inches } = cmToFeetInches(cm);
    return `${feet}'${inches}"`;
  }
  return `${Math.round(cm)} cm`;
};

/* ---------- water ---------- */

export const waterUnit = (units) => (units?.water === 'oz' ? 'oz' : 'ml');
export const formatWater = (ml, units) => {
  if (waterUnit(units) === 'oz') return `${Math.round(mlToOz(ml))} oz`;
  return ml >= 1000 ? `${(ml / 1000).toFixed(2)} L` : `${Math.round(ml)} ml`;
};

/* ---------- generic numbers ---------- */

export const formatNumber = (n, decimals = 0) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }) : '—';

export const signed = (n, decimals = 1) =>
  `${n > 0 ? '+' : ''}${n.toFixed(decimals)}`;
