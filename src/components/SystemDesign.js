import React, { useState, useEffect } from 'react';

const SystemDesign = ({ membranes, systemConfig, setSystemConfig, projection, waterData, onRun }) => {
  const [showMembraneModal, setShowMembraneModal] = useState(false);
  const [selectedStageForMembrane, setSelectedStageForMembrane] = useState(1);
  const [localPass1Stages, setLocalPass1Stages] = useState(null); // Local state for input while typing

  // Get stages from systemConfig, always ensure 6 stages exist
  const getStages = () => {
    if (systemConfig.stages && systemConfig.stages.length === 6) {
      return systemConfig.stages;
    }
    // Initialize with only Stage 1 active (vessels > 0), others have 0
    const stage1Vessels = systemConfig.stage1Vessels || 4;
    return [
      { membraneModel: systemConfig.membraneModel || 'espa2ld', elementsPerVessel: systemConfig.elementsPerVessel || 6, vessels: stage1Vessels },
      { membraneModel: systemConfig.membraneModel || 'espa2ld', elementsPerVessel: systemConfig.elementsPerVessel || 6, vessels: 0 },
      { membraneModel: systemConfig.membraneModel || 'espa2ld', elementsPerVessel: systemConfig.elementsPerVessel || 6, vessels: 0 },
      { membraneModel: systemConfig.membraneModel || 'espa2ld', elementsPerVessel: systemConfig.elementsPerVessel || 6, vessels: 0 },
      { membraneModel: systemConfig.membraneModel || 'espa2ld', elementsPerVessel: systemConfig.elementsPerVessel || 6, vessels: 0 },
      { membraneModel: systemConfig.membraneModel || 'espa2ld', elementsPerVessel: systemConfig.elementsPerVessel || 6, vessels: 0 }
    ];
  };

  const stages = getStages();
  
  // Use pass1Stages from systemConfig as source of truth, default to 1
  // This is the CONTROLLING value - it determines how many stages are active
  const pass1Stages = (systemConfig.pass1Stages !== undefined && systemConfig.pass1Stages >= 1 && systemConfig.pass1Stages <= 6)
    ? systemConfig.pass1Stages 
    : 1; // Default to 1 stage initially

  // Initialize stages in systemConfig if not present
  useEffect(() => {
    if (!systemConfig.stages || systemConfig.stages.length !== 6) {
      const initialStages = getStages();
      setSystemConfig(prev => ({
        ...prev,
        stages: initialStages,
        pass1Stages: prev.pass1Stages !== undefined ? prev.pass1Stages : 1
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync localPass1Stages when systemConfig.pass1Stages changes externally
  useEffect(() => {
    if (localPass1Stages !== null && systemConfig.pass1Stages !== localPass1Stages) {
      setLocalPass1Stages(null); // Clear local state to show the actual value
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemConfig.pass1Stages]);

  const handleInputChange = (key, value) => {
    const resetsDesign = [
      'permeateFlow',
      'recovery',
      'numTrains',
      'elementsPerVessel',
      'stage1Vessels',
      'stage2Vessels',
      'membraneModel'
    ].includes(key);
    setSystemConfig({ ...systemConfig, [key]: value, ...(resetsDesign ? { designCalculated: false } : {}) });
  };

  const handleStageChange = (stageIndex, field, value) => {
    const currentStages = systemConfig.stages || stages;
    const newStages = [...currentStages];
    newStages[stageIndex] = { ...newStages[stageIndex], [field]: value };
    
    // Preserve designCalculated state - if it was already calculated, keep it calculated
    // so flux updates in real-time when vessels/stages change
    const keepCalculated = systemConfig.designCalculated;
    
    // If vessels changed for a stage beyond pass1Stages, auto-increase pass1Stages
    if (field === 'vessels') {
      const vesselValue = parseInt(value) || 0;
      if (vesselValue > 0 && stageIndex >= pass1Stages) {
        // User is setting vessels for a stage beyond current pass1Stages
        // Auto-increase pass1Stages to include this stage
        const newPass1Stages = stageIndex + 1;
        // Copy Stage 1 values to any new stages that were added
        const stage1Values = { ...currentStages[0] };
        for (let i = pass1Stages; i < newPass1Stages; i++) {
          if (i !== stageIndex) { // Don't overwrite the stage being edited
            newStages[i] = { ...stage1Values, vessels: 0 };
          }
        }
        
        setSystemConfig({ 
          ...systemConfig, 
          stages: newStages,
          stage1Vessels: newStages[0].vessels,
          stage2Vessels: newStages[1]?.vessels || 0,
          elementsPerVessel: newStages[0].elementsPerVessel,
          membraneModel: newStages[0].membraneModel,
          pass1Stages: newPass1Stages, // Auto-update pass1Stages
          designCalculated: keepCalculated // Preserve calculated state
        });
        return;
      }
    }
    
    setSystemConfig({ 
      ...systemConfig, 
      stages: newStages,
      stage1Vessels: newStages[0].vessels,
      stage2Vessels: newStages[1]?.vessels || 0,
      elementsPerVessel: newStages[0].elementsPerVessel,
      membraneModel: newStages[0].membraneModel,
      // Keep pass1Stages unchanged
      designCalculated: keepCalculated // Preserve calculated state so flux updates in real-time
    });
  };

  const handlePass1StagesChange = (value) => {
    // value can be a number or string
    const numStages = Math.min(Math.max(parseInt(value) || 1, 1), 6);
    const currentPass1Stages = systemConfig.pass1Stages !== undefined ? systemConfig.pass1Stages : pass1Stages;
    
    if (numStages === currentPass1Stages) {
      return; // No change needed
    }
    
    // Get current stages from systemConfig
    const currentStages = systemConfig.stages || stages;
    const newStages = [...currentStages];
    const stage1Values = { ...currentStages[0] };
    
    if (numStages > currentPass1Stages) {
      // Increasing: Add new stages by copying Stage 1 values
      // New stages get Stage 1 membrane and elements, but vessels start at 0
      for (let i = currentPass1Stages; i < numStages; i++) {
        newStages[i] = { 
          ...stage1Values, 
          vessels: 0  // New stages start with 0 vessels
        };
      }
    } else {
      // Decreasing: FORCE clear vessels for stages beyond numStages
      // This ensures Pass 1 stages CONTROLS the number of active stages
      for (let i = numStages; i < 6; i++) {
        newStages[i] = { 
          ...stage1Values, 
          vessels: 0  // Force to 0 for stages beyond numStages
        };
      }
    }
    
    // Preserve designCalculated state - if it was already calculated, keep it calculated
    // so flux updates in real-time when stages change
    const keepCalculated = systemConfig.designCalculated;
    
    // Update systemConfig with new pass1Stages value
    setSystemConfig(prev => ({
      ...prev,
      stages: newStages,
      stage1Vessels: newStages[0].vessels,
      stage2Vessels: newStages[1]?.vessels || 0,
      pass1Stages: numStages, // Store in config as source of truth - this CONTROLS active stages
      designCalculated: keepCalculated // Preserve calculated state so flux updates in real-time
    }));
  };

  const handleMembraneSelect = (membraneId) => {
    const currentStages = systemConfig.stages || stages;
    const newStages = [...currentStages];
    newStages[selectedStageForMembrane - 1] = { 
      ...newStages[selectedStageForMembrane - 1], 
      membraneModel: membraneId 
    };
    setSystemConfig({ 
      ...systemConfig, 
      stages: newStages,
      membraneModel: newStages[0].membraneModel,
      designCalculated: false 
    });
    setShowMembraneModal(false);
  };

  const openMembraneModal = (stageNum) => {
    setSelectedStageForMembrane(stageNum);
    setShowMembraneModal(true);
  };

  const handleFlowUnitChange = (nextUnit) => {
    // Get decimal precision for the new unit (matching Hydranautics)
    const getFlowDecimals = (flowUnit) => {
      if (['gpm', 'm3/h'].includes(flowUnit)) return 2;
      if (['gpd', 'm3/d'].includes(flowUnit)) return 1;
      if (['mgd', 'migd', 'mld'].includes(flowUnit)) return 3;
      return 2; // default
    };
    
    // DO NOT convert the permeate flow value - keep it the same, only change unit and precision
    const prevVal = Number(systemConfig.permeateFlow) || 0;
    const nextDecimals = getFlowDecimals(nextUnit);

    setSystemConfig({
      ...systemConfig,
      flowUnit: nextUnit,
      // Keep the same numeric value, only format with new precision
      permeateFlow: prevVal.toFixed(nextDecimals),
      designCalculated: false
    });
  };

  // Get decimal precision for flow unit (matching Hydranautics)
  const getFlowDecimals = (flowUnit) => {
    if (['gpm', 'm3/h'].includes(flowUnit)) return 2;
    if (['gpd', 'm3/d'].includes(flowUnit)) return 1;
    if (['mgd', 'migd', 'mld'].includes(flowUnit)) return 3;
    return 2; // default
  };

  // Format flux to match flow unit decimal precision when value is 0
  const formatFluxDisplay = (fluxValue, flowUnit) => {
    if (!fluxValue || fluxValue === '0' || fluxValue === '0.0' || fluxValue === '0.00' || fluxValue === '0.000') {
      const decimals = getFlowDecimals(flowUnit);
      return '0.' + '0'.repeat(decimals); // e.g., '0.00', '0.0', '0.000'
    }
    return fluxValue; // Use the value as-is when calculated
  };

  const panelStyle = { background: '#c2d1df', border: '1px solid #8ba4bb', padding: '10px', borderRadius: '2px' };
  const headerStyle = { background: '#004a80', color: 'white', padding: '4px 8px', fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '10px' };
  const rowStyle = { display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.75rem' };
  const inputStyle = { width: '70px', textAlign: 'right', border: '1px solid #999' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', fontFamily: 'Arial' }}>
      
      {/* TOP SECTION: INPUT PANELS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 0.8fr', gap: '10px' }}>
        <div style={panelStyle}>
          <div style={headerStyle}>Train Information</div>
          <div style={rowStyle}><span>Feed pH</span> <input style={inputStyle} value={systemConfig.feedPh} onChange={e => handleInputChange('feedPh', e.target.value)} /></div>
          <div style={rowStyle}><span>Permeate recovery %</span> <input style={inputStyle} value={systemConfig.recovery} onChange={e => handleInputChange('recovery', e.target.value)} /></div>
          <div style={rowStyle}>
            <span>Permeate flow</span>
            <div style={{display:'flex', gap:'2px'}}>
              <select style={{fontSize:'0.7rem'}} value={systemConfig.flowUnit} onChange={e => handleFlowUnitChange(e.target.value)}>
                <option value="gpm">gpm</option>
                <option value="gpd">gpd</option>
                <option value="mgd">mgd</option>
                <option value="migd">migd</option>
                <option value="m3/h">m3/h</option>
                <option value="m3/d">m3/d</option>
                <option value="mld">mld</option>
              </select>
              <input style={inputStyle} value={systemConfig.permeateFlow} onChange={e => handleInputChange('permeateFlow', e.target.value)} />
            </div>
          </div>
          <div style={rowStyle}>
            <span>Average flux</span>
            <div style={{display:'flex', gap:'4px', alignItems:'center'}}>
              <select style={{fontSize:'0.7rem'}} value={systemConfig.fluxUnit || 'gfd'} onChange={e => handleInputChange('fluxUnit', e.target.value)}>
                <option value="gfd">gfd</option>
                <option value="lmh">lmh</option>
              </select>
              <div style={{...inputStyle, background: '#eee'}}>
                {formatFluxDisplay(
                  systemConfig.fluxUnit === 'lmh' ? (projection?.fluxLMH ?? '0.000') : (projection?.fluxGFD ?? '0.000'),
                  systemConfig.flowUnit || 'gpm'
                )}
              </div>
            </div>
          </div>
          <div style={rowStyle}>
            <span>Feed flow</span>
            <div style={{display:'flex', gap:'4px', alignItems:'center'}}>
              <div style={{...inputStyle, background: '#eee'}}>{projection?.feedFlow ?? '0.00'}</div>
              <span style={{ fontSize: '0.7rem', color: '#333' }}>{systemConfig.flowUnit || 'gpm'}</span>
            </div>
          </div>
          <div style={rowStyle}>
            <span>Concentrate flow</span>
            <div style={{display:'flex', gap:'4px', alignItems:'center'}}>
              <div style={{...inputStyle, background: '#eee'}}>{projection?.concentrateFlow ?? '0.00'}</div>
              <span style={{ fontSize: '0.7rem', color: '#333' }}>{systemConfig.flowUnit || 'gpm'}</span>
            </div>
          </div>
        </div>

        <div style={panelStyle}>
          <div style={headerStyle}>Conditions</div>
          <div style={{ ...rowStyle, fontWeight: 'bold', marginTop: '2px' }}><span>Pass 1</span></div>
          <div style={rowStyle}>
            <span>Chemical</span>
            <select style={{ ...inputStyle, width: '110px', textAlign: 'left' }} value={systemConfig.chemical} onChange={e => handleInputChange('chemical', e.target.value)}>
              <option value="None">None</option>
              <option value="Antiscalant">Antiscalant</option>
              <option value="SBS">SBS</option>
              <option value="Acid">Acid</option>
              <option value="Caustic">Caustic</option>
            </select>
          </div>
          <div style={rowStyle}>
            <span>Chemical concentration</span>
            <div style={{display:'flex', gap:'4px', alignItems:'center'}}>
              <input style={inputStyle} value={systemConfig.chemicalConcentration} onChange={e => handleInputChange('chemicalConcentration', e.target.value)} />
              <span style={{ fontSize: '0.7rem', color: '#333' }}>%</span>
            </div>
          </div>
          <div style={rowStyle}>
            <span>Chemical dose</span>
            <div style={{display:'flex', gap:'4px', alignItems:'center'}}>
              <input style={inputStyle} value={systemConfig.chemicalDose} onChange={e => handleInputChange('chemicalDose', e.target.value)} />
              <select style={{fontSize:'0.7rem'}} value={systemConfig.doseUnit} onChange={e => handleInputChange('doseUnit', e.target.value)}>
                <option value="mg/l">mg/l</option>
                <option value="lb/hr">lb/hr</option>
                <option value="kg/hr">kg/hr</option>
              </select>
            </div>
          </div>
          <div style={rowStyle}><span>Membrane age (years)</span> <input style={inputStyle} value={systemConfig.membraneAge} onChange={e => handleInputChange('membraneAge', e.target.value)} /></div>
          <div style={rowStyle}><span>Flux decline %/yr</span> <input style={inputStyle} value={systemConfig.fluxDeclinePerYear} onChange={e => handleInputChange('fluxDeclinePerYear', e.target.value)} /></div>
          <div style={rowStyle}><span>Fouling factor</span> <input style={inputStyle} value={systemConfig.foulingFactor} onChange={e => handleInputChange('foulingFactor', e.target.value)} /></div>
          <div style={rowStyle}><span>SP increase % per year</span> <input style={inputStyle} value={systemConfig.spIncreasePerYear} onChange={e => handleInputChange('spIncreasePerYear', e.target.value)} /></div>
        </div>

        <div style={panelStyle}>
          <div style={headerStyle}>System</div>
          <div style={rowStyle}>
            <span>Total plant product flow</span>
            <div style={{display:'flex', gap:'4px', alignItems:'center'}}>
              <input style={{...inputStyle, background:'#eee'}} value={projection?.totalPlantProductFlowDisplay ?? '0.00'} readOnly />
              <span style={{ fontSize: '0.7rem', color: '#333' }}>{systemConfig.flowUnit || 'gpm'}</span>
            </div>
          </div>
          <div style={rowStyle}><span>Number of trains</span> <input style={inputStyle} value={systemConfig.numTrains} onChange={e => handleInputChange('numTrains', e.target.value)} /></div>
        </div>
      </div>

      {/* MIDDLE SECTION: SPECIFICATIONS & RUN BUTTON */}
      <div style={panelStyle}>
        <div style={headerStyle}>System Specifications</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px' }}>
          <div style={{ flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', background: 'white' }}>
              <thead>
                <tr style={{ background: '#f0f0f0' }}>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left', width: '120px' }}></th>
                  {Array.from({ length: pass1Stages }, (_, i) => i + 1).map(stageNum => (
                    <th key={stageNum} style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'center' }}>
                      Stage {stageNum}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ border: '1px solid #ccc', padding: '8px', fontWeight: 'bold' }}>Membrane type</td>
                  {Array.from({ length: pass1Stages }, (_, i) => i + 1).map(stageNum => {
                    const currentStages = systemConfig.stages || stages;
                    const stage = currentStages[stageNum - 1];
                    const selectedMembrane = membranes.find(m => m.id === stage?.membraneModel) || membranes[0];
                    return (
                      <td key={stageNum} style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'center' }}>
                        <input
                          type="text"
                          value={selectedMembrane?.name || ''}
                          onClick={() => openMembraneModal(stageNum)}
                          readOnly
                          style={{
                            width: '100%',
                            padding: '4px',
                            textAlign: 'center',
                            border: '1px solid #999',
                            background: '#fffacd',
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td style={{ border: '1px solid #ccc', padding: '8px', fontWeight: 'bold' }}>Membranes/vessel</td>
                  {Array.from({ length: pass1Stages }, (_, i) => i + 1).map(stageNum => {
                    const currentStages = systemConfig.stages || stages;
                    const stage = currentStages[stageNum - 1];
                    return (
                      <td key={stageNum} style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'center' }}>
                        <input
                          type="number"
                          value={stage?.elementsPerVessel || ''}
                          onChange={(e) => handleStageChange(stageNum - 1, 'elementsPerVessel', parseInt(e.target.value) || 0)}
                          style={{
                            width: '100%',
                            padding: '4px',
                            textAlign: 'center',
                            border: '1px solid #999',
                            fontSize: '0.75rem'
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td style={{ border: '1px solid #ccc', padding: '8px', fontWeight: 'bold' }}>No. of vessels</td>
                  {Array.from({ length: pass1Stages }, (_, i) => i + 1).map(stageNum => {
                    const currentStages = systemConfig.stages || stages;
                    const stage = currentStages[stageNum - 1];
                    const hasError = (stage?.vessels || 0) === 0;
                    return (
                      <td key={stageNum} style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'center' }}>
                        <input
                          type="number"
                          value={stage?.vessels || ''}
                          onChange={(e) => handleStageChange(stageNum - 1, 'vessels', parseInt(e.target.value) || 0)}
                          style={{
                            width: '100%',
                            padding: '4px',
                            textAlign: 'center',
                            border: hasError ? '2px solid red' : '1px solid #999',
                            fontSize: '0.75rem'
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.75rem' }}>
              <span>Pass 1 stages:</span>
              <input
                type="number"
                min="1"
                max="6"
                step="1"
                value={localPass1Stages !== null ? localPass1Stages : pass1Stages}
                onChange={(e) => {
                  const val = e.target.value;
                  // Allow typing any value temporarily
                  if (val === '') {
                    setLocalPass1Stages('');
                    return;
                  }
                  const numVal = parseInt(val);
                  if (!isNaN(numVal)) {
                    setLocalPass1Stages(numVal);
                    // Update immediately if valid
                    if (numVal >= 1 && numVal <= 6) {
                      handlePass1StagesChange(numVal);
                    }
                  }
                }}
                onBlur={(e) => {
                  // Validate and apply on blur
                  const val = parseInt(e.target.value);
                  if (isNaN(val) || val < 1 || val > 6) {
                    // Invalid, restore to current pass1Stages
                    setLocalPass1Stages(null);
                  } else {
                    const clamped = Math.min(Math.max(val, 1), 6);
                    setLocalPass1Stages(null);
                    if (clamped !== pass1Stages) {
                      handlePass1StagesChange(clamped);
                    }
                  }
                }}
                onKeyDown={(e) => {
                  // Handle arrow keys
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const newVal = Math.min(pass1Stages + 1, 6);
                    setLocalPass1Stages(null);
                    handlePass1StagesChange(newVal);
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const newVal = Math.max(pass1Stages - 1, 1);
                    setLocalPass1Stages(null);
                    handlePass1StagesChange(newVal);
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    e.target.blur(); // Trigger onBlur validation
                  }
                }}
                style={{ width: '60px', padding: '4px', textAlign: 'center', border: '1px solid #999' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button onClick={() => {
              setSystemConfig({
                ...systemConfig,
                pass1Stages: 1,
                stages: (systemConfig.stages || stages).map((stage, index) =>
                  index === 0 ? stage : { ...stage, vessels: 0 }
                ),
                stage1Vessels: 4,
                stage2Vessels: 0,
                elementsPerVessel: 6,
                membraneModel: 'espa2ld',
                designCalculated: false
              });
            }} style={{ 
              background: 'linear-gradient(#bdc3c7, #95a5a6)', color: 'white', padding: '10px 30px', 
              borderRadius: '20px', border: '1px solid #7f8c8d', cursor: 'pointer', fontWeight: 'bold',
              alignSelf: 'flex-start'
            }}>
              Recalculate array
            </button>
            <button onClick={onRun} style={{ 
              background: 'linear-gradient(#3498db, #2980b9)', color: 'white', padding: '10px 30px', 
              borderRadius: '20px', border: '1px solid #004a80', cursor: 'pointer', fontWeight: 'bold',
              alignSelf: 'flex-start'
            }}>
              Run
            </button>
          </div>
        </div>
      </div>

      {/* MEMBRANE SELECTION MODAL */}
      {showMembraneModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }} onClick={() => setShowMembraneModal(false)}>
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '8px',
            maxWidth: '600px',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>Select Membrane Type for Stage {selectedStageForMembrane}</h3>
              <button onClick={() => setShowMembraneModal(false)} style={{
                background: '#e74c3c',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '5px 15px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
              {membranes.map(membrane => (
                <button
                  key={membrane.id}
                  onClick={() => handleMembraneSelect(membrane.id)}
                  style={{
                    padding: '10px',
                    border: '2px solid #004a80',
                    borderRadius: '4px',
                    background: 'white',
                    cursor: 'pointer',
                    textAlign: 'center',
                    fontSize: '0.85rem',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.target.style.background = '#e3f2fd'}
                  onMouseOut={(e) => e.target.style.background = 'white'}
                >
                  <div style={{ fontWeight: 'bold' }}>{membrane.name}</div>
                  <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '4px' }}>{membrane.type}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM SECTION: CALCULATION RESULTS (VISIBLE ONLY AFTER RUN) */}
      {systemConfig.designCalculated && projection && (
        <div style={{ ...panelStyle, background: '#d9e4f0' }}>
          <div style={headerStyle}>Calculation Results</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'center', background: 'white' }}>
            <thead style={{ background: '#eee' }}>
              <tr>
                <th style={{ border: '1px solid #ccc' }}>Array</th>
                <th style={{ border: '1px solid #ccc' }}>Vessels</th>
                <th style={{ border: '1px solid #ccc' }}>Feed (psi)</th>
                <th style={{ border: '1px solid #ccc' }}>Conc (psi)</th>
                <th style={{ border: '1px solid #ccc' }}>Feed (gpm)</th>
                <th style={{ border: '1px solid #ccc' }}>Conc (gpm)</th>
                <th style={{ border: '1px solid #ccc' }}>Flux (gfd)</th>
                <th style={{ border: '1px solid #ccc' }}>Highest flux (gfd)</th>
                <th style={{ border: '1px solid #ccc' }}>Highest beta</th>
              </tr>
            </thead>
            <tbody>
              {(projection.stageResults && projection.stageResults.length > 0 ? projection.stageResults : [{
                index: 1,
                vessels: systemConfig.stage1Vessels,
                feedPressurePsi: projection.calcFeedPressurePsi ?? '0.0',
                concPressurePsi: projection.calcConcPressurePsi ?? '0.0',
                feedFlowGpm: projection.calcFeedFlowGpm ?? '0.00',
                concFlowGpm: projection.calcConcFlowGpm ?? '0.00',
                fluxGfd: projection.calcFluxGfd ?? '0.0',
                highestFluxGfd: projection.calcHighestFluxGfd ?? '0.0',
                highestBeta: projection.calcHighestBeta ?? '0.00'
              }]).map((row) => (
                <tr key={`stage-${row.index}`}>
                  <td style={{ border: '1px solid #ccc' }}>1 - {row.index}</td>
                  <td style={{ border: '1px solid #ccc' }}>{row.vessels}</td>
                  <td style={{ border: '1px solid #ccc' }}>{row.feedPressurePsi}</td>
                  <td style={{ border: '1px solid #ccc' }}>{row.concPressurePsi}</td>
                  <td style={{ border: '1px solid #ccc' }}>{row.feedFlowGpm}</td>
                  <td style={{ border: '1px solid #ccc' }}>{row.concFlowGpm}</td>
                  <td style={{ border: '1px solid #ccc' }}>{row.fluxGfd}</td>
                  <td style={{ border: '1px solid #ccc' }}>{row.highestFluxGfd}</td>
                  <td style={{ border: '1px solid #ccc' }}>{row.highestBeta}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: '12px', background: 'white', padding: '8px', border: '1px solid #c2d1df' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '6px', fontSize: '0.75rem' }}>Permeate Concentration (mg/L)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px', fontSize: '0.7rem' }}>
              <div>Ca: {projection.permeateConcentration?.ca ?? '0.000'}</div>
              <div>Mg: {projection.permeateConcentration?.mg ?? '0.000'}</div>
              <div>Na: {projection.permeateConcentration?.na ?? '0.000'}</div>
              <div>K: {projection.permeateConcentration?.k ?? '0.000'}</div>
              <div>Sr: {projection.permeateConcentration?.sr ?? '0.000'}</div>
              <div>Ba: {projection.permeateConcentration?.ba ?? '0.000'}</div>
              <div>HCO3: {projection.permeateConcentration?.hco3 ?? '0.000'}</div>
              <div>SO4: {projection.permeateConcentration?.so4 ?? '0.000'}</div>
              <div>Cl: {projection.permeateConcentration?.cl ?? '0.000'}</div>
              <div>NO3: {projection.permeateConcentration?.no3 ?? '0.000'}</div>
              <div>SiO2: {projection.permeateConcentration?.sio2 ?? '0.000'}</div>
              <div>PO4: {projection.permeateConcentration?.po4 ?? '0.000'}</div>
              <div>F: {projection.permeateConcentration?.f ?? '0.000'}</div>
              <div>B: {projection.permeateConcentration?.b ?? '0.000'}</div>
              <div>CO2: {projection.permeateConcentration?.co2 ?? '0.000'}</div>
              <div>CO3: {projection.permeateConcentration?.co3 ?? '0.000'}</div>
              <div>pH: {projection.permeateParameters?.ph ?? '0.0'}</div>
              <div>TDS: {projection.permeateParameters?.tds ?? '0.0'} mg/L</div>
            </div>
          </div>

          <div style={{ marginTop: '10px', background: 'white', padding: '8px', border: '1px solid #c2d1df' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '6px', fontSize: '0.75rem' }}>Concentrate Saturations and Parameters</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px', fontSize: '0.7rem' }}>
              <div>CaSO4: {projection.concentrateSaturation?.caSo4 ?? '0.0'}%</div>
              <div>BaSO4: {projection.concentrateSaturation?.baSo4 ?? '0.0'}%</div>
              <div>SrSO4: {projection.concentrateSaturation?.srSo4 ?? '0.0'}%</div>
              <div>SiO2: {projection.concentrateSaturation?.sio2 ?? '0.0'}%</div>
              <div>Ca3(PO4)2: {projection.concentrateSaturation?.ca3po42 ?? '0.00'}%</div>
              <div>CaF2: {projection.concentrateSaturation?.caF2 ?? '0.0'}%</div>
              <div>Osmotic: {projection.concentrateParameters?.osmoticPressure ?? '0.0'} psi</div>
              <div>CCPP: {projection.concentrateParameters?.ccpp ?? '0.0'} mg/L</div>
              <div>Langelier: {projection.concentrateParameters?.langelier ?? '0.00'}</div>
              <div>pH: {projection.concentrateParameters?.ph ?? '0.0'}</div>
              <div>TDS: {projection.concentrateParameters?.tds ?? '0.0'} mg/L</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemDesign;