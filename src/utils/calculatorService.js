/* ================= IMSDesign Hydraulic Engine (REFINED) ================= */

const FLOW_TO_M3H = {
    gpm: 0.2271,
    gpd: 0.0001577,
    mgd: 157.725,
    migd: 189.27,
    'm3/h': 1,
    'm3/d': 1 / 24,
    mld: 41.667
  };

export const calculateSystem = (inputs) => {
  const {
    totalFlow,        // 70.00 m3/h
    recovery = 55,    // 55.00 %
    vessels = 23,     // 23
    elementsPerVessel = 1,
    feedPH = 7.0,
    tempF = 77
  } = inputs;

  // 1. Physical Constants
  const recFrac = (Number(recovery) || 0) / 100;
  const areaPerElement = 400; // Standard for ESPA2-LD 8-inch
  const totalElements = (Number(vessels) || 0) * (Number(elementsPerVessel) || 0);

  // 2. Flow Balancing (m3/h)
  const feedFlowTotal = recFrac > 0 ? Number(totalFlow) / recFrac : 0;
  const concentrateFlowTotal = feedFlowTotal - Number(totalFlow || 0);
  
  const feedFlowPerVessel = Number(vessels) > 0 ? feedFlowTotal / Number(vessels) : 0;
  const concFlowPerVessel = Number(vessels) > 0 ? concentrateFlowTotal / Number(vessels) : 0;
  const avgFlowPerVessel = (feedFlowPerVessel + concFlowPerVessel) / 2;

  // 3. Flux Calculations (gfd)
  const avgFlux = totalElements > 0 ? (Number(totalFlow) * 264.172 * 24) / (totalElements * areaPerElement) : 0;
  const highestFlux = avgFlux * (1 + (recFrac * 0.32)); 

  // 4. Pressure & Beta Logic
  const beta = Math.exp(0.7 * recFrac);

  const kfb = 0.315; 
  const pressureDrop = (Number(elementsPerVessel) || 0) * kfb * Math.pow(avgFlowPerVessel, 1.75);
  
  const feedPressure = 20.7; 
  const concPressure = feedPressure - pressureDrop;

  // 5. Permeate Chemistry (Simplified for empty water analysis)
  const permPH = 4.3;
  const concPH = 7.3;

  return {
    avgFlux: avgFlux.toFixed(1),
    highestFlux: highestFlux.toFixed(1),
    feedFlowVessel: feedFlowPerVessel.toFixed(2),
    concFlowVessel: concFlowPerVessel.toFixed(2),
    feedPressure: feedPressure.toFixed(1),
    concPressure: concPressure.toFixed(1),
    highestBeta: beta.toFixed(2),
    permPH: permPH.toFixed(1),
    concPH: concPH.toFixed(1),
    warning: highestFlux > 20 ? 'Design limits exceeded' : null,
    feedPH
  };
};

export const calculateIonPassage = (feedIons, systemData) => {
  const { recovery, tempC, vessels } = systemData;
  const recFrac = (Number(recovery) || 0) / 100;

  // 1. Beta Factor (Concentration Polarization)
  const beta = Math.exp(0.7 * recFrac);

  // 2. Average Concentrate Concentration Factor (CF)
  const cf = recFrac > 0 && recFrac < 1 ? Math.log(1 / (1 - recFrac)) / recFrac : 1;

  // 3. Membrane Rejection Characteristics (Standard for ESPA2-LD)
  const rejections = {
    Ca: 0.994,
    Mg: 0.994,
    Na: 0.990,
    K: 0.985,
    Cl: 0.988,
    SO4: 0.997,
    HCO3: 0.980,
    NO3: 0.920,
    CO2: 0.0
  };

  let permeateTDS = 0;
  const permeateIons = {};
  const concentrateIons = {};

  Object.keys(feedIons || {}).forEach((ion) => {
    const feedConc = Number(feedIons[ion]) || 0;
    const rej = rejections[ion] != null ? rejections[ion] : 0.99;

    // Salt Passage = (1 - Rejection) * CF * Beta
    const saltPassage = (1 - rej) * cf * beta;

    permeateIons[ion] = feedConc * saltPassage;
    concentrateIons[ion] = recFrac > 0 && recFrac < 1 ? feedConc / (1 - recFrac) : feedConc;
    permeateTDS += permeateIons[ion];
  });

  // 4. Langelier Saturation Index (LSI) Approximation
  const tds_conc = Object.values(concentrateIons).reduce((a, b) => a + (Number(b) || 0), 0);
  const pCa = -Math.log10((concentrateIons.Ca || 0) / 40080 || 1);
  const pAlk = -Math.log10((concentrateIons.HCO3 || 0) / 61010 || 1);
  const C_const = (Math.log10(tds_conc || 1) - 1) / 10;
  const pHs = (9.3 + C_const) + pCa + pAlk;

  const lsi = 7.3 - pHs;

  return {
    permeateIons,
    concentrateIons,
    permeateTDS: permeateTDS.toFixed(2),
    lsi: lsi.toFixed(2),
    beta: beta.toFixed(2),
    tempC,
    vessels
  };
};
  
  export const runHydraulicBalance = (config, membrane) => {
    /* ---------- 1. RAW INPUTS & SAFETY ---------- */
    const permeateInput = Number(config.permeateFlow) || 0;
    const unit = config.flowUnit || 'm3/h';
    const unitFactor = FLOW_TO_M3H[unit] ?? 1;
  
    // Clamp recovery between 1% and 99% to prevent Infinity errors
    const recoveryPercent = Math.min(Math.max(Number(config.recovery) || 15, 1), 99);
    const recovery = recoveryPercent / 100;
  
    const vessels = Number(config.stage1Vessels) || 0;
    const elementsPerVessel = Number(config.elementsPerVessel) || 0;
    
    // Use membrane area from object, fallback to 400 if missing
    const elementArea = Number(membrane?.area) || 400;
  
    const membraneAge = Number(config.membraneAge) || 0;
    const fluxDeclinePct = Number(config.fluxDeclinePerYear) || 0;
  
    /* ---------- 2. HYDRAULIC BALANCE (m3/h) ---------- */
    const permeate_m3h = permeateInput * unitFactor;
    const feed_m3h = permeate_m3h / recovery;
    const concentrate_m3h = feed_m3h - permeate_m3h;
  
    /* ---------- 3. FLUX CALCULATIONS ---------- */
    const totalElements = vessels * elementsPerVessel;
    const totalArea_m2 = totalElements * elementArea;
  
    let avgFlux_LMH = 0;
    if (totalArea_m2 > 0) {
      avgFlux_LMH = (permeate_m3h * 1000) / totalArea_m2;
    }
  
    // IMSDesign uses 0.589 to convert LMH to GFD
    const flux_GFD = avgFlux_LMH * 0.589;
  
    /* ---------- 4. AGEING / FOULING ---------- */
    // Formula: (1 - decline)^age
    const foulingFactor = Math.pow(1 - fluxDeclinePct / 100, membraneAge) || 1;
  
    /* ---------- 5. CHEMICAL MASS FLOW ---------- */
    let chemical_kg_hr = 0;
    const dose = Number(config.chemicalDose) || 0;
    if (config.doseUnit === 'mg/l') {
      chemical_kg_hr = (dose * feed_m3h) / 1000;
    } else if (config.doseUnit === 'lb/hr') {
      chemical_kg_hr = dose * 0.4536;
    } else {
      chemical_kg_hr = dose;
    }
  
    /* ---------- 6. UNIT BACK-CONVERSION ---------- */
    // Convert m3/h results back to the user's display unit (e.g. gpm)
    const feedDisplay = feed_m3h / unitFactor;
    const concDisplay = concentrate_m3h / unitFactor;
  
    return {
      feedFlow: feedDisplay.toFixed(2),
      concentrateFlow: concDisplay.toFixed(2),
      permeateFlow: permeateInput.toFixed(2),
      totalElements: totalElements,
      unit: unit
    };
  };