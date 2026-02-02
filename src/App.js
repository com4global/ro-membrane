import React, { useState, useEffect, useRef } from 'react';
import WaterAnalysis from './components/WaterAnalysis';
import PreTreatment from './components/PreTreatment';
import SystemDesign from './components/SystemDesign';
import PostTreatment from './components/PostTreatment';
import Report from './components/Report';
import MembraneEditor from './components/MembraneEditor';
import DesignGuidelines from './components/DesignGuidelines';
import ValidationBanner from './components/ValidationBanner';

const App = () => {
  const [activeTab, setActiveTab] = useState('analysis');
  const [isLoaded, setIsLoaded] = useState(false);
  const [isGuidelineOpen, setIsGuidelineOpen] = useState(false);
  const fileInputRef = useRef(null);

  const FLOW_TO_M3H = {
    gpm: 0.2271,
    gpd: 0.0001577,
    mgd: 157.725,
    migd: 189.27,
    'm3/h': 1,
    'm3/d': 1 / 24,
    mld: 41.667
  };

  const DEFAULT_SYSTEM_CONFIG = {
    // Inputs (follow IMSDesign layout: System-level total + trains; Train values are calculated)
    feedPh: 7.0,
    recovery: 55,
    flowUnit: 'gpm', // gpm/gpd/mgd/migd/m3/h/m3/d/mld
    permeateFlow: 77, // train permeate flow in selected unit
    numTrains: 1,

    // Array specification
    stage1Vessels: 4,
    stage2Vessels: 0,
    elementsPerVessel: 6,
    membraneModel: 'espa2ld',
    pass1Stages: 1, // Initially only 1 stage is active
    stages: [
      { membraneModel: 'espa2ld', elementsPerVessel: 6, vessels: 4 },
      { membraneModel: 'espa2ld', elementsPerVessel: 6, vessels: 0 },
      { membraneModel: 'espa2ld', elementsPerVessel: 6, vessels: 0 },
      { membraneModel: 'espa2ld', elementsPerVessel: 6, vessels: 0 },
      { membraneModel: 'espa2ld', elementsPerVessel: 6, vessels: 0 },
      { membraneModel: 'espa2ld', elementsPerVessel: 6, vessels: 0 }
    ],

    // Flux display
    fluxUnit: 'gfd', // gfd | lmh

    // Hydranautics behavior: flux stays 0 until "Recalculate array"
    designCalculated: false,

    // Conditions
    membraneAge: 0,
    fluxDeclinePerYear: 5,
    foulingFactor: 1,
    spIncreasePerYear: 7,

    // Chemical (as per IMSDesign "Pass 1")
    chemical: 'None',
    chemicalConcentration: 100, // %
    chemicalDose: 0,
    doseUnit: 'mg/l', // mg/l | lb/hr | kg/hr

    // Economics
    energyCostPerKwh: 0.12
  };

  // --- 1. STATE MANAGEMENT ---
  const [snapshots, setSnapshots] = useState([]); 
  const [membranes, setMembranes] = useState([
    { id: 'espa2ld', name: 'ESPA2-LD', area: 400, aValue: 0.18, rejection: 99.7, monoRejection: 96.0, divalentRejection: 99.7, silicaRejection: 98.0, boronRejection: 90.0, alkalinityRejection: 99.5, co2Rejection: 0.0, type: 'Brackish' },
    { id: 'cpa3', name: 'CPA3', area: 400, aValue: 0.12, rejection: 99.7, monoRejection: 96.0, divalentRejection: 99.7, silicaRejection: 98.0, boronRejection: 90.0, alkalinityRejection: 99.5, co2Rejection: 0.0, type: 'Brackish' },
    { id: 'swc5ld', name: 'SWC5-LD', area: 400, aValue: 0.06, rejection: 99.8, monoRejection: 98.0, divalentRejection: 99.8, silicaRejection: 99.0, boronRejection: 92.0, alkalinityRejection: 99.7, co2Rejection: 0.0, type: 'Seawater' },
    // Legacy 4" element example (4040) used in IMSDesign screenshots
    { 
      id: 'lfc3ld4040',
      name: 'LFC3-LD4040',
      area: 80,
      aValue: 0.12,
      rejection: 99.7,
      monoRejection: 92.0,
      divalentRejection: 99.95,
      silicaRejection: 99.95,
      boronRejection: 99.9,
      alkalinityRejection: 99.985,
      co2Rejection: 0.0,
      ionRejectionOverrides: {
        na: 93.04,
        cl: 91.07,
        k: 99.9,
        no3: 99.99,
        f: 99.99,
        hco3: 99.984,
        co3: 99.99,
        so4: 99.99,
        ca: 99.99,
        mg: 99.99,
        sr: 99.99,
        ba: 99.99,
        sio2: 99.99,
        po4: 99.99,
        b: 99.99,
        co2: 0.0
      },
      type: 'Low Fouling'
    }
  ]); 
  
  const [projectNotes, setProjectNotes] = useState(""); 
  const [waterData, setWaterData] = useState({
    projectName: 'New_Project_V3',
    waterType: 'Well Water',
    temp: 25, ph: 7.5, ca: 60, mg: 20, na: 250, k: 15, 
    hco3: 250, so4: 100, cl: 300, no3: 25, sio2: 20
  });

  const [systemConfig, setSystemConfig] = useState(DEFAULT_SYSTEM_CONFIG);

  const [pretreatment, setPretreatment] = useState({ antiscalantDose: 3.5, sbsDose: 2.0 });
  const [postTreatment, setPostTreatment] = useState({ causticDose: 2.0 });
  
  const [projection, setProjection] = useState({ 
    fluxGFD: 0, pumpPressure: 0, monthlyEnergyCost: 0, permeateFlow: 0 
  });
  
  // Store base numeric values (without unit conversion) to preserve them when unit changes
  const baseValuesRef = useRef({ 
    permeate: null, 
    feed: null, 
    concentrate: null, 
    unit: null 
  });

  // --- 2. MASTER CALCULATION ENGINE ---
  useEffect(() => {
    const M3H_TO_GPD = 24 * 264.172052; // m3/h -> gal/day

    const unit = FLOW_TO_M3H[systemConfig.flowUnit] ? systemConfig.flowUnit : 'gpm';
    const unitFactor = FLOW_TO_M3H[unit] ?? 1;

    const trains = Math.max(Number(systemConfig.numTrains) || 1, 1);
    const trainPermeateInput = Number(systemConfig.permeateFlow) || 0;
    const perTrainProduct_m3h = trainPermeateInput * unitFactor;
    const totalProduct_m3h = perTrainProduct_m3h * trains;

    // Clamp recovery to avoid Infinity
    const recoveryPct = Math.min(Math.max(Number(systemConfig.recovery) || 15, 1), 99);
    const recovery = recoveryPct / 100;

    // Legacy train mass balance (as in screenshot 2)
    const perTrainFeed_m3h = perTrainProduct_m3h / recovery;
    const perTrainConc_m3h = perTrainFeed_m3h - perTrainProduct_m3h;

    // Calculate total elements across all active stages
    // Use stages array if available, otherwise fall back to legacy stage1Vessels/stage2Vessels
    let totalElements = 0;
    if (systemConfig.stages && systemConfig.stages.length > 0) {
      // Sum elements from all active stages (up to pass1Stages)
      const pass1Stages = Math.min(Math.max(Number(systemConfig.pass1Stages) || 1, 1), 6);
      for (let i = 0; i < pass1Stages; i++) {
        const stage = systemConfig.stages[i];
        if (stage) {
          const stageVessels = Number(stage.vessels) || 0;
          const stageElementsPerVessel = Number(stage.elementsPerVessel) || 0;
          totalElements += stageVessels * stageElementsPerVessel;
        }
      }
    } else {
      // Legacy fallback: use stage1Vessels and stage2Vessels
      totalElements = (Number(systemConfig.stage1Vessels) + Number(systemConfig.stage2Vessels)) * Number(systemConfig.elementsPerVessel);
    }
    
    // Get membrane area - use first stage's membrane if stages array exists, otherwise use membraneModel
    let activeMem;
    if (systemConfig.stages && systemConfig.stages.length > 0 && systemConfig.stages[0]) {
      activeMem = membranes.find(m => m.id === systemConfig.stages[0].membraneModel) || membranes[0];
    } else {
      activeMem = membranes.find(m => m.id === systemConfig.membraneModel) || membranes[0];
    }
    
    // Ensure we have a valid membrane with area
    const membraneArea = Number(activeMem?.area) || 400; // Default to 400 ft² if not found
    const totalArea_ft2 = totalElements * membraneArea;
    const totalArea_m2 = totalArea_ft2 * 0.09290304;

    const perTrainProduct_gpd = perTrainProduct_m3h * M3H_TO_GPD;
    
    // Calculate flux - always calculate, but only display if designCalculated is true
    let rawFluxGFD = 0;
    let rawFluxLMH = 0;
    if (totalArea_ft2 > 0 && perTrainProduct_gpd > 0) {
      rawFluxGFD = perTrainProduct_gpd / totalArea_ft2;
    }
    if (totalArea_m2 > 0 && perTrainProduct_m3h > 0) {
      rawFluxLMH = (perTrainProduct_m3h * 1000) / totalArea_m2;
    }
    
    // Only show flux value if designCalculated is true, otherwise show 0
    const fluxGFD = systemConfig.designCalculated ? rawFluxGFD : 0;
    const fluxLMH = systemConfig.designCalculated ? rawFluxLMH : 0;
    
    // Debug logging to understand why flux is 0 (only log when calculated but still 0)
    if (systemConfig.designCalculated && rawFluxGFD === 0 && rawFluxLMH === 0) {
      console.warn('Flux is 0 after calculation! Debug info:');
      console.log('  - designCalculated:', systemConfig.designCalculated);
      console.log('  - totalElements:', totalElements);
      console.log('  - membraneArea:', membraneArea);
      console.log('  - totalArea_ft2:', totalArea_ft2);
      console.log('  - totalArea_m2:', totalArea_m2);
      console.log('  - perTrainProduct_gpd:', perTrainProduct_gpd);
      console.log('  - perTrainProduct_m3h:', perTrainProduct_m3h);
      console.log('  - rawFluxGFD:', rawFluxGFD);
      console.log('  - rawFluxLMH:', rawFluxLMH);
      console.log('  - pass1Stages:', systemConfig.pass1Stages);
      console.log('  - stages:', systemConfig.stages?.map((s, i) => ({ 
        stage: i + 1, 
        vessels: s.vessels, 
        elements: s.elementsPerVessel,
        membrane: s.membraneModel 
      })));
    }

    // Check if only the unit changed (not the permeate flow value)
    // If so, use the stored base values and just reformat with new precision
    const permeateNumeric = Number(trainPermeateInput) || 0;
    const prevPermeate = baseValuesRef.current.permeate;
    const prevUnit = baseValuesRef.current.unit;
    const onlyUnitChanged = prevUnit !== null && 
                            prevUnit !== unit &&
                            prevPermeate !== null &&
                            Math.abs(prevPermeate - permeateNumeric) < 0.0001;
    
    // Back-convert for display (train-level, same unit as UI)
    let perTrainProduct_display, perTrainFeed_display, perTrainConc_display;
    
    if (onlyUnitChanged && baseValuesRef.current.feed !== null) {
      // Only unit changed - use stored values, just reformat
      perTrainProduct_display = baseValuesRef.current.permeate;
      perTrainFeed_display = baseValuesRef.current.feed;
      perTrainConc_display = baseValuesRef.current.concentrate;
    } else {
      // Permeate flow changed or first calculation - calculate normally
      perTrainProduct_display = trainPermeateInput;
      perTrainFeed_display = perTrainFeed_m3h / unitFactor;
      perTrainConc_display = perTrainConc_m3h / unitFactor;
      
      // Store base values for next unit change
      baseValuesRef.current = {
        permeate: permeateNumeric,
        feed: perTrainFeed_display,
        concentrate: perTrainConc_display,
        unit: unit
      };
    }
    
    const totalPlantProduct_display = perTrainProduct_display * trains;

    // Format flows based on unit type (matching Hydranautics precision exactly)
    // gpm, m3/h: 2 decimals (e.g., 166.70, 66.70)
    // gpd, m3/d: 1 decimal (e.g., 166.7, 66.7)
    // mgd, migd, mld: 3 decimals (e.g., 166.700, 66.700)
    const getFlowDecimals = (flowUnit) => {
      if (['gpm', 'm3/h'].includes(flowUnit)) return 2;
      if (['gpd', 'm3/d'].includes(flowUnit)) return 1;
      if (['mgd', 'migd', 'mld'].includes(flowUnit)) return 3;
      return 2; // default
    };
    const flowDecimals = getFlowDecimals(unit);

    // Format function that matches Hydranautics display behavior
    // When unit changes, we want to keep the same numeric values, just change precision
    const formatFlow = (value, decimals) => {
      // Parse the value to get the raw number, then format with new precision
      const numValue = typeof value === 'string' ? parseFloat(value) : value;
      return Number(numValue).toFixed(decimals);
    };

    // Chemical usage (basis: train feed flow)
    const dose = Number(systemConfig.chemicalDose) || 0;
    const concPct = Math.min(Math.max(Number(systemConfig.chemicalConcentration) || 100, 1), 100);
    let chemicalActive_kg_hr = 0;
    if (systemConfig.doseUnit === 'mg/l') {
      // mg/L * m3/h -> kg/h
      chemicalActive_kg_hr = (dose * perTrainFeed_m3h) / 1000;
    } else if (systemConfig.doseUnit === 'lb/hr') {
      chemicalActive_kg_hr = dose * 0.45359237;
    } else if (systemConfig.doseUnit === 'kg/hr') {
      chemicalActive_kg_hr = dose;
    }
    const chemicalSolution_kg_hr = chemicalActive_kg_hr / (concPct / 100);

    // Keep the existing (simplified) pressure/energy model, but make it consistent with the new flow basis.
    const TCF = Math.exp(2640 * (1 / 298.15 - 1 / (Number(waterData.temp) + 273.15)));
    const CF = 1 / (1 - recovery);

    const getNumeric = (value) => Number(value) || 0;
    const ionFeed = {
      ca: getNumeric(waterData.ca),
      mg: getNumeric(waterData.mg),
      na: getNumeric(waterData.na),
      k: getNumeric(waterData.k),
      sr: getNumeric(waterData.sr),
      ba: getNumeric(waterData.ba),
      hco3: getNumeric(waterData.hco3),
      so4: getNumeric(waterData.so4),
      cl: getNumeric(waterData.cl),
      no3: getNumeric(waterData.no3),
      sio2: getNumeric(waterData.sio2),
      po4: getNumeric(waterData.po4),
      b: getNumeric(waterData.b),
      f: getNumeric(waterData.f),
      co2: getNumeric(waterData.co2),
      co3: getNumeric(waterData.co3)
    };

    const membraneRejection = Math.min(Math.max(Number(activeMem?.rejection) || 99.7, 80), 99.9);
    const defaultMono = Math.max(Math.min((Number(activeMem?.monoRejection) || (membraneRejection - 6)), 99.9), 80);
    const defaultDivalent = Math.max(Math.min((Number(activeMem?.divalentRejection) || membraneRejection), 99.9), 80);
    const silicaRejection = Math.max(Math.min((Number(activeMem?.silicaRejection) || (membraneRejection - 1)), 99.9), 80);
    const boronRejection = Math.max(Math.min((Number(activeMem?.boronRejection) || (membraneRejection - 8)), 99.9), 60);
    const alkalinityRejection = Math.max(Math.min((Number(activeMem?.alkalinityRejection) || (membraneRejection - 0.2)), 99.9), 80);
    const co2Rejection = Math.max(Math.min((Number(activeMem?.co2Rejection) || 0), 99.9), 0);

    const getIonRejection = (ionKey) => {
      const overrides = activeMem?.ionRejectionOverrides || {};
      if (overrides[ionKey] != null) return Number(overrides[ionKey]);
      if (['ca', 'mg', 'sr', 'ba', 'so4', 'po4'].includes(ionKey)) return defaultDivalent;
      if (['na', 'k', 'cl', 'no3', 'f'].includes(ionKey)) return defaultMono;
      if (['hco3', 'co3'].includes(ionKey)) return alkalinityRejection;
      if (ionKey === 'sio2') return silicaRejection;
      if (ionKey === 'b') return boronRejection;
      if (ionKey === 'co2') return co2Rejection;
      return membraneRejection;
    };

    const formatConc = (value) => Number(value).toFixed(3);
    const sumValues = (obj) => Object.values(obj).reduce((sum, val) => sum + (Number(val) || 0), 0);

    const permeateConcentration = Object.fromEntries(
      Object.entries(ionFeed).map(([key, value]) => {
        const rejection = getIonRejection(key);
        const passage = Math.max(1 - rejection / 100, 0);
        return [key, formatConc(value * passage)];
      })
    );
    const concentrateConcentration = Object.fromEntries(
      Object.entries(ionFeed).map(([key, value]) => [key, formatConc(value * CF)])
    );

    const permeateTds = sumValues(permeateConcentration);
    const concentrateTds = sumValues(concentrateConcentration);
    const osmoticP = (concentrateTds * 0.76) / 1000;

    // Ageing / fouling / SP increase: approximate Hydranautics behaviour
    const membraneAge = Math.max(Number(systemConfig.membraneAge) || 0, 0);
    const fluxDeclinePct = Math.min(Math.max(Number(systemConfig.fluxDeclinePerYear) || 0, 0), 99);
    const spIncreasePct = Math.min(Math.max(Number(systemConfig.spIncreasePerYear) || 0, 0), 200);
    const foulingFactor = Math.max(Number(systemConfig.foulingFactor) || 1, 1);

    const aBase = Number(activeMem.aValue) || 0.12;
    const aEffective = aBase * Math.pow(1 - fluxDeclinePct / 100, membraneAge);
    const spFactor = Math.pow(1 + spIncreasePct / 100, membraneAge);

    // Pump model expects a flux-like term; use GFD computed above.
    const pressureTerm = (fluxGFD / (TCF * (aEffective || aBase))) * foulingFactor;
    const pumpPressure = (pressureTerm + osmoticP + 1.2) * spFactor;

    // Use total plant feed for power (m3/h)
    const totalFeed_m3h = perTrainFeed_m3h * trains;
    const powerKw = (pumpPressure * totalFeed_m3h) / (36.7 * 0.75);
    const monthlyEnergy = powerKw * 24 * 30 * Number(systemConfig.energyCostPerKwh);

    // Format flux: Always show 0 with appropriate decimals based on unit when not calculated
    // The actual value stays 0, only the decimal precision changes with unit
    const formatFlux = (value, isCalculated, flowUnit) => {
      if (!isCalculated) {
        // Match the decimal precision of the flow unit
        const fluxDecimals = getFlowDecimals(flowUnit);
        return '0.' + '0'.repeat(fluxDecimals); // e.g., '0.00', '0.0', '0.000'
      }
      return Number(value).toFixed(1); // 1 decimal when calculated
    };

    const permeatePh = Math.min(Math.max(getNumeric(waterData.ph) - 1.1, 0), 14);
    const concentratePh = Math.min(Math.max(getNumeric(waterData.ph) + Math.log10(CF) * 0.3, 0), 14);

    // Langelier Saturation Index (simplified, consistent with PreTreatment)
    const pCa = 5.0 - Math.log10(Math.max(getNumeric(concentrateConcentration.ca) * 2.5, 0.0001));
    const pAlk = 5.0 - Math.log10(Math.max(getNumeric(concentrateConcentration.hco3) * 0.82, 0.0001));
    const C = (Math.log10(Math.max(concentrateTds, 1)) - 1) / 10 + (Number(waterData.temp) > 25 ? 2.0 : 2.3);
    const phs = C + pCa + pAlk;
    const lsi = concentratePh - phs;
    const ccpp = lsi > 0 ? lsi * 50 : 0;

    const caConc = getNumeric(concentrateConcentration.ca);
    const so4Conc = getNumeric(concentrateConcentration.so4);
    const baConc = getNumeric(concentrateConcentration.ba);
    const srConc = getNumeric(concentrateConcentration.sr);
    const sio2Conc = getNumeric(concentrateConcentration.sio2);
    const po4Conc = getNumeric(concentrateConcentration.po4);
    const fConc = getNumeric(concentrateConcentration.f);

    const concentrateSaturation = {
      caSo4: Number((caConc * so4Conc) / 1000).toFixed(1),
      baSo4: Number((baConc * so4Conc) / 50).toFixed(1),
      srSo4: Number((srConc * so4Conc) / 2000).toFixed(1),
      sio2: Number((sio2Conc / 120) * 100).toFixed(1),
      ca3po42: Number((caConc * po4Conc) / 100).toFixed(2),
      caF2: Number((caConc * fConc) / 500).toFixed(1)
    };

    const concentrateParameters = {
      osmoticPressure: osmoticP.toFixed(1),
      ccpp: Number(ccpp).toFixed(1),
      langelier: lsi.toFixed(2),
      ph: concentratePh.toFixed(1),
      tds: concentrateTds.toFixed(1)
    };
    const permeateParameters = {
      ph: permeatePh.toFixed(1),
      tds: permeateTds.toFixed(1)
    };

    setProjection({
      // Train-level flows (match IMSDesign Train Information box with unit-based precision)
      permeateFlow: formatFlow(perTrainProduct_display, flowDecimals),
      feedFlow: formatFlow(perTrainFeed_display, flowDecimals),
      concentrateFlow: formatFlow(perTrainConc_display, flowDecimals),

      // System-level flows (used by other tabs/models)
      totalPlantProductFlowM3h: totalProduct_m3h.toFixed(3),
      totalPlantProductFlowDisplay: formatFlow(totalPlantProduct_display, flowDecimals),
      flowUnit: unit,
      feedFlowM3h: perTrainFeed_m3h.toFixed(3),
      totalFeedFlowM3h: totalFeed_m3h.toFixed(3),

      // Core KPIs - flux formatting matches Hydranautics (0 with unit-based decimals when not calculated)
      fluxGFD: formatFlux(fluxGFD, systemConfig.designCalculated, unit),
      fluxLMH: formatFlux(fluxLMH, systemConfig.designCalculated, unit),
      pumpPressure: pumpPressure.toFixed(1),
      monthlyEnergyCost: monthlyEnergy.toFixed(2),

      chemicalActiveKgHr: chemicalActive_kg_hr.toFixed(3),
      chemicalSolutionKgHr: chemicalSolution_kg_hr.toFixed(3),

      tcf: TCF.toFixed(2),
      activeMembrane: activeMem,
      totalElements: totalElements,

      permeateConcentration,
      concentrateSaturation,
      concentrateParameters,
      permeateParameters
    });
  }, [waterData, systemConfig, membranes]);

  // --- 3. PERSISTENCE ---
  useEffect(() => {
    const saved = localStorage.getItem('ro_pro_v3_master_final');
    if (saved) {
      try {
        const p = JSON.parse(saved);
        setWaterData(p.waterData);
        const merged = { ...DEFAULT_SYSTEM_CONFIG, ...(p.systemConfig || {}) };
        // Back-compat: older saves had totalPlantProductFlow instead of permeateFlow
        if ((merged.permeateFlow === undefined || merged.permeateFlow === null) && merged.totalPlantProductFlow != null) {
          const trains = Math.max(Number(merged.numTrains) || 1, 1);
          merged.permeateFlow = Number(merged.totalPlantProductFlow) / trains;
        }
        setSystemConfig(merged);
        setMembranes(p.membranes || membranes);
        setProjectNotes(p.projectNotes || "");
        setSnapshots(p.snapshots || []);
      } catch (e) { console.error("Restore failed", e); }
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      const dataToSave = { waterData, systemConfig, membranes, snapshots, projectNotes, pretreatment, postTreatment };
      localStorage.setItem('ro_pro_v3_master_final', JSON.stringify(dataToSave));
    }
  }, [waterData, systemConfig, membranes, snapshots, projectNotes, pretreatment, postTreatment, isLoaded]);

  // --- 4. ACTION HANDLERS ---
  const takeSnapshot = () => {
    const name = prompt("Enter snapshot name (e.g. 'Case 1 - Winter'):");
    if (name) {
      const newSnapshot = {
        id: Date.now(),
        name,
        timestamp: new Date().toLocaleTimeString(),
        results: { ...projection },
        config: { ...systemConfig }
      };
      setSnapshots([...snapshots, newSnapshot]);
      alert("Snapshot added to Report tab.");
    }
  };

  const handleReset = () => {
    if (window.confirm("WARNING: This will delete all design data and reset the app. Continue?")) {
      localStorage.removeItem('ro_pro_v3_master_final');
      window.location.reload();
    }
  };

  const handleSaveToFile = () => {
    const data = { waterData, systemConfig, pretreatment, postTreatment, snapshots, projectNotes };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${waterData.projectName}_Design.json`;
    link.click();
  };

  const handleLoadFromFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (data.waterData) setWaterData(data.waterData);
        if (data.systemConfig) setSystemConfig({ ...DEFAULT_SYSTEM_CONFIG, ...(data.systemConfig || {}) });
        if (data.snapshots) setSnapshots(data.snapshots);
        alert("Success: Design Loaded!");
      } catch (err) { alert("Error: Invalid File Format"); }
    };
    reader.readAsText(file);
  };
  
  useEffect(() => {
    if (activeTab === 'design') {
      setSystemConfig((current) => ({
        ...current,
        pass1Stages: 1,
        stages: (current.stages || DEFAULT_SYSTEM_CONFIG.stages).map((stage, index) =>
          index === 0 ? stage : { ...stage, vessels: 0 }
        ),
        stage2Vessels: 0,
        designCalculated: false
      }));
    }
  }, [activeTab]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f4f7f9', display: 'flex', flexDirection: 'column' }}>
      
      {/* GLOBAL HEADER */}
      <header style={{ backgroundColor: '#002f5d', color: '#fff', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem' }}>IMSDesign Pro 3.0</h2>
        
        <nav style={{ display: 'flex', gap: '2px' }}>
          {['analysis', 'pretreatment', 'design', 'post', 'report', 'database'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{ padding: '10px 15px', background: activeTab === t ? '#f39c12' : 'transparent', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.75rem' }}>
              {t}
            </button>
          ))}
        </nav>

        {/* RESTORED ACTION GROUP */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={takeSnapshot} style={{ background: '#9b59b6', border: 'none', color: 'white', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>📸 Snapshot</button>
          <button onClick={handleSaveToFile} style={{ background: '#27ae60', border: 'none', color: 'white', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>💾 Save</button>
          <button onClick={() => fileInputRef.current.click()} style={{ background: '#3498db', border: 'none', color: 'white', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>📁 Load</button>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleLoadFromFile} />
          <button onClick={handleReset} style={{ background: '#e74c3c', border: 'none', color: 'white', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>Reset</button>
        </div>
      </header>

      <ValidationBanner projection={projection} systemConfig={systemConfig} waterData={waterData} />

      <main style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
        {activeTab === 'analysis' && <WaterAnalysis waterData={waterData} setWaterData={setWaterData} />}
        {activeTab === 'pretreatment' && <PreTreatment waterData={waterData} pretreatment={pretreatment} setPretreatment={setPretreatment} systemConfig={systemConfig} />}
        {activeTab === 'design' && (
          <SystemDesign
            membranes={membranes}
            systemConfig={systemConfig}
            setSystemConfig={setSystemConfig}
            projection={projection}
            waterData={waterData}
            onRun={() => setSystemConfig(c => ({ ...c, designCalculated: true }))}
          />
        )}
        {activeTab === 'post' && <PostTreatment projection={projection} postTreatment={postTreatment} setPostTreatment={setPostTreatment} systemConfig={systemConfig} />}
        {activeTab === 'report' && (
          <Report 
            waterData={waterData} 
            systemConfig={systemConfig} 
            projection={projection} 
            pretreatment={pretreatment}
            postTreatment={postTreatment}
            projectNotes={projectNotes} 
            setProjectNotes={setProjectNotes} 
            snapshots={snapshots} 
            setSnapshots={setSnapshots}
          />
        )}
        {activeTab === 'database' && (
          <MembraneEditor
            membranes={membranes}
            setMembranes={setMembranes}
            systemConfig={systemConfig}
            setSystemConfig={setSystemConfig}
          />
        )}
      </main>

      <footer style={{ background: '#fff', borderTop: '1px solid #ddd', padding: '5px 20px', display: 'flex', gap: '20px', fontSize: '0.75rem', color: '#666' }}>
        <span>Project: <strong>{waterData.projectName}</strong></span>
        <span>Active Membrane: <strong>{projection.activeMembrane?.name}</strong></span>
        <span>Temp: <strong>{waterData.temp}°C</strong></span>
      </footer>

      <DesignGuidelines isOpen={isGuidelineOpen} onClose={() => setIsGuidelineOpen(false)} currentWaterType={waterData.waterType} />
    </div>
  );
};

export default App;