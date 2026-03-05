-- ============================================================================
-- SEED: 7 Projects + 55 Equipments + VDCR - For Gaurav Singh
-- ============================================================================
-- Firm ID:  a9cd3b95-7240-4b31-bd93-bb6bc84d5e03
-- User ID:  c3b31393-9b29-4165-8982-feb8af14e875 (Gaurav Singh - Firm Admin)
--
-- Project 1: HPCL Mumbai Refinery - CDU Vessels
--            10 equipments, 35 VDCR entries, 6-12 revisions per doc
-- Project 2: IOCL Vadodara - Hydrotreater Reactor & Separators
--            6 equipments, 7 VDCR entries, 4-7 revisions per doc
-- Project 3: BPCL Kochi - FCCU Regenerator & Stripper
--            8 equipments, 4 VDCR entries, 5-6 revisions per doc
-- Project 4: MRPL Mangalore - Delayed Coker Drums & Vessels
--            7 equipments, 6 VDCR entries, 4-6 revisions per doc
-- Project 5: ONGC Dahej - Gas Processing Vessels (8 equip)
-- Project 6: GAIL Pata - NGL Fractionation Unit (8 equip)
-- Project 7: Reliance Jamnagar - Polypropylene Reactors (8 equip)
--
-- All projects: full technical_sections, custom_fields 1-8, equipment_documents
-- (datasheet, MTR, WPS, Test Certificate, Hydro Test, NDT, Calibration, etc.)
-- Team members have equipment_assignments. VDCRs have full revision history.
--
-- USAGE: Copy entire script → Supabase Dashboard → SQL Editor → Run
-- ============================================================================

DO $$
DECLARE
  v_firm_id uuid := 'a9cd3b95-7240-4b31-bd93-bb6bc84d5e03';
  v_user_id uuid := 'c3b31393-9b29-4165-8982-feb8af14e875';
  v_project_id uuid;
  v_project_id_2 uuid;
  v_project_id_3 uuid;
  v_project_id_4 uuid;
  v_project_id_5 uuid;
  v_project_id_6 uuid;
  v_project_id_7 uuid;
  v_equip_ids uuid[] := '{}';
  v_equip_id uuid;
  v_vdcr_id uuid;
  v_i int;
  v_j int;
BEGIN
  -- ========== 1. PROJECT ==========
  INSERT INTO public.projects (
    name, client, location, manager, deadline, po_number, firm_id, created_by,
    project_manager_id, vdcr_manager_id, scope_of_work, status, sales_order_date,
    client_industry, client_focal_point, tpi_agency, vdcr_manager, consultant,
    kickoff_meeting_notes, special_production_notes, services_included,
    equipment_count, active_equipment, progress
  ) VALUES (
    'HPCL Mumbai Refinery - Crude Distillation Unit Vessels',
    'Hindustan Petroleum Corporation Limited',
    'Mumbai Refinery, Maharashtra',
    'Gaurav Singh',
    CURRENT_DATE + INTERVAL '14 months',
    'PO-HPCL-2024-2156',
    v_firm_id,
    v_user_id,
    v_user_id,
    v_user_id,
    'Supply of 10 pressure equipment items for CDU revamp: 3 pressure vessels, 2 heat exchangers, 2 columns, 1 reactor, 1 separator, 1 drum. Full design, fabrication, documentation and VDCR cycle. ASME VIII Div.1, IBR compliant. TPI witness for hydro test and NDT.',
    'active',
    CURRENT_DATE - INTERVAL '45 days',
    'Oil & Gas',
    'Rajesh Kumar - Senior Project Engineer',
    'TÜV SÜD',
    'Gaurav Singh',
    'Lloyd''s Register - Design Review',
    '- Kickoff completed 45 days ago. Client expects first Rev-00 submissions within 8 weeks.
- All Code 1 documents require formal approval. Code 2 for review.
- TPI witness required for hydro test, RT/UT. Client rep for FAT.
- Expedited delivery on V-101, V-102, E-201 - critical path.',
    '- SA-516 Gr.70 for shell, SA-240 316L for clad. 3mm corrosion allowance.
- Material lead time 10 weeks. Prioritize V-101/V-102 material.
- Client prefers weekly progress updates. VDCR tracker shared every Friday.',
    '{"design": true, "testing": true, "commissioning": false, "documentation": true, "manufacturing": true, "installationSupport": true}'::jsonb,
    10, 10, 18
  )
  RETURNING id INTO v_project_id;

  -- ========== 2. EQUIPMENT (10 items) ==========
  INSERT INTO public.equipment (
    project_id, type, tag_number, job_number, manufacturing_serial, name, size, material,
    design_code, status, progress, progress_phase, supervisor, welder, qc_inspector,
    project_manager, location, next_milestone, next_milestone_date, priority,
    custom_field_1_name, custom_field_1_value, custom_field_2_name, custom_field_2_value,
    custom_field_3_name, custom_field_3_value, custom_field_4_name, custom_field_4_value,
    custom_field_5_name, custom_field_5_value, custom_field_6_name, custom_field_6_value,
    custom_field_7_name, custom_field_7_value, custom_field_8_name, custom_field_8_value,
    notes, created_by, technical_sections, last_update
  ) VALUES
  -- V-101 Primary Crude Separator
  (v_project_id, 'Pressure Vessel', 'V-101', 'JOB-HPCL-2156-01', 'Primary Crude Separator - 72" Vessel', 'Primary Crude Separator', '72" ID x 28'' T/T', 'SA-516 Gr.70 + 3mm SA-240 316L clad', 'ASME VIII Div.1', 'in-progress', 55, 'fabrication', 'Vikram Sharma', 'Ramesh Patel', 'Anil Deshmukh', 'Gaurav Singh', 'Shop A - Bay 2', 'Shell weld joint 4 - NDT clearance', CURRENT_DATE + INTERVAL '5 days', 'high',
   'Design Pressure', '85 psig', 'Design Temp', '750°F', 'MAWP', '95 psig', 'Corrosion Allowance', '3mm', 'Hydro Test Pressure', '127 psig', 'Operating Pressure', '65 psig', 'Liquid Level', '60%', 'Retention Time', '8 min',
   'Primary separation of crude feed. 72" ID, 28'' T/T. 3mm clad on shell and heads. 4'' inlet, 2x 6'' liquid outlets, 1x 8'' vapour outlet. Internal baffle per P&ID. Critical path - expedited.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"74 inch"},{"name":"ID","value":"72 inch"},{"name":"Thickness","value":"12.7mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Cladding","value":"SA-240 316L 3mm"},{"name":"Corrosion Allowance","value":"3mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"},{"name":"Thickness","value":"14.3mm"},{"name":"Material","value":"SA-516 Gr.70 + 3mm clad"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"85 psig"},{"name":"Design Temp","value":"750°F"},{"name":"MAWP","value":"95 psig"},{"name":"Operating Pressure","value":"65 psig"}]},{"name":"Nozzles","customFields":[{"name":"Inlet","value":"4 inch"},{"name":"Liquid Outlets","value":"2x 6 inch"},{"name":"Vapour Outlet","value":"8 inch"}]}]'::jsonb, CURRENT_DATE - 2),
  -- V-102 Flash Drum
  (v_project_id, 'Pressure Vessel', 'V-102', 'JOB-HPCL-2156-02', 'Flash Drum - 48" Horizontal', 'Flash Drum', '48" ID x 18'' T/T', 'SA-516 Gr.70', 'ASME VIII Div.1', 'documentation', 35, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'Datasheet Rev-02 client approval', CURRENT_DATE + INTERVAL '12 days', 'high',
   'Design Pressure', '45 psig', 'Design Temp', '550°F', 'MAWP', '50 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '68 psig', 'Operating Pressure', '35 psig', 'Liquid Level', '50%', 'Retention Time', '5 min',
   'Flash drum for vapour-liquid separation. 48" ID, 18'' T/T. Horizontal. Demister pad. 3'' vapour, 2x 4'' liquid outlets. Datasheet under client review.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"50 inch"},{"name":"ID","value":"48 inch"},{"name":"Thickness","value":"9.5mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Corrosion Allowance","value":"3mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"},{"name":"Thickness","value":"10.3mm"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"45 psig"},{"name":"Design Temp","value":"550°F"},{"name":"MAWP","value":"50 psig"}]},{"name":"Internals","customFields":[{"name":"Demister","value":"Yes"},{"name":"Retention Time","value":"5 min"}]}]'::jsonb, CURRENT_DATE - 5),
  -- E-201 Crude Preheat Exchanger
  (v_project_id, 'Heat Exchanger', 'E-201', 'JOB-HPCL-2156-03', 'Titanium Shell & Tube Heat Exchanger', 'Crude Preheat Exchanger', '36" Shell x 20'' - 2 pass', 'Shell: SA-516 Gr.70, Tubes: SA-179', 'ASME VIII Div.1, TEMA B', 'in-progress', 42, 'fabrication', 'Vikram Sharma', 'Suresh Kumar', 'Anil Deshmukh', 'Gaurav Singh', 'Shop B', 'Tube bundle fit-up & hydro', CURRENT_DATE + INTERVAL '8 days', 'high',
   'Design Pressure Shell', '150 psig', 'Design Pressure Tube', '200 psig', 'Design Temp', '650°F', 'TEMA Class', 'B', 'Tube Count', '342', 'Baffle Cut', '25%', 'Hydro Test Shell', '225 psig', 'Hydro Test Tube', '300 psig',
   'Shell & tube, fixed tubesheet. 36" shell, 342 tubes 3/4" OD. 2-pass tube side. Baffle spacing 12". Critical for crude preheat train.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"38 inch"},{"name":"ID","value":"36 inch"},{"name":"Thickness","value":"12.7mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Design Pressure","value":"150 psig"},{"name":"Design Temp","value":"650°F"}]},{"name":"Tube Bundle","customFields":[{"name":"Tube OD","value":"3/4 inch"},{"name":"Tube Count","value":"342"},{"name":"Material","value":"SA-179"},{"name":"Passes","value":"2"},{"name":"Design Pressure","value":"200 psig"}]},{"name":"Baffles","customFields":[{"name":"Type","value":"Single segmental"},{"name":"Cut","value":"25%"},{"name":"Spacing","value":"12 inch"}]},{"name":"TEMA","customFields":[{"name":"Class","value":"B"},{"name":"Front Head","value":"B"},{"name":"Shell","value":"E"},{"name":"Rear Head","value":"M"}]}]'::jsonb, CURRENT_DATE - 1),
  -- E-202 Overhead Condenser
  (v_project_id, 'Heat Exchanger', 'E-202', 'JOB-HPCL-2156-04', 'Bayonet Type Overhead Condenser', 'Overhead Condenser', '24" Shell x 12''', 'Shell: SA-516 Gr.70, Tubes: SA-179', 'ASME VIII Div.1, TEMA B', 'pending', 15, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Pending', 'P&ID Rev-04 approval', CURRENT_DATE + INTERVAL '18 days', 'medium',
   'Design Pressure Shell', '75 psig', 'Design Pressure Tube', '100 psig', 'Design Temp', '400°F', 'TEMA Class', 'B', 'Tube Count', '156', 'Baffle Cut', '20%', 'Hydro Test Shell', '112 psig', 'Hydro Test Tube', '150 psig',
   'Overhead vapour condenser. 24" shell. Awaiting P&ID finalisation. Material ordered.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"26 inch"},{"name":"ID","value":"24 inch"},{"name":"Thickness","value":"9.5mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Design Pressure","value":"75 psig"},{"name":"Design Temp","value":"400°F"}]},{"name":"Tube Bundle","customFields":[{"name":"Tube OD","value":"3/4 inch"},{"name":"Tube Count","value":"156"},{"name":"Material","value":"SA-179"},{"name":"Type","value":"Bayonet"}]},{"name":"Baffles","customFields":[{"name":"Cut","value":"20%"},{"name":"Spacing","value":"10 inch"}]}]'::jsonb, CURRENT_DATE - 10),
  -- C-301 Stripping Column
  (v_project_id, 'Column', 'C-301', 'JOB-HPCL-2156-05', 'Fractionator Column - 18 Tray', 'Stripping Column', '84" ID x 45'' T/T - 18 trays', 'SA-516 Gr.70', 'ASME VIII Div.1', 'documentation', 25, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'Datasheet Rev-00 submission', CURRENT_DATE + INTERVAL '14 days', 'high',
   'Design Pressure', '35 psig', 'Design Temp', '650°F', 'MAWP', '40 psig', 'Trays', '18', 'Tray Type', 'Sieve', 'Corrosion Allowance', '3mm', 'Hydro Test', '52 psig', 'Operating Pressure', '28 psig',
   'Stripping column 84" ID, 45'' T/T. 18 sieve trays. 6'' feed, 4'' O/H, 3x 6'' side draws. GA drawing in progress.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"86 inch"},{"name":"ID","value":"84 inch"},{"name":"Thickness","value":"12.7mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"T/T Length","value":"45 ft"},{"name":"Corrosion Allowance","value":"3mm"}]},{"name":"Heads","customFields":[{"name":"Top Head","value":"2:1 SE"},{"name":"Bottom Head","value":"2:1 SE"}]},{"name":"Internals","customFields":[{"name":"Tray Type","value":"Sieve"},{"name":"Tray Count","value":"18"},{"name":"Tray Spacing","value":"24 inch"},{"name":"Downcomer","value":"Standard"}]},{"name":"Nozzles","customFields":[{"name":"Feed","value":"6 inch"},{"name":"Overhead","value":"4 inch"},{"name":"Side Draws","value":"3x 6 inch"}]}]'::jsonb, CURRENT_DATE - 7),
  -- R-401 Hydrotreating Reactor
  (v_project_id, 'Reactor', 'R-401', 'JOB-HPCL-2156-06', 'Hydrotreating Reactor - 2 Catalyst Bed', 'Hydrotreating Reactor', '60" ID x 32'' T/T', 'SA-387 Gr.11 Cl.2 + 3mm 347 clad', 'ASME VIII Div.2', 'pending', 8, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Pending', 'Design calc Rev-02 approval', CURRENT_DATE + INTERVAL '25 days', 'high',
   'Design Pressure', '450 psig', 'Design Temp', '950°F', 'MAWP', '495 psig', 'Catalyst Beds', '2', 'Corrosion Allowance', '3mm', 'Hydro Test', '675 psig', 'Operating Pressure', '380 psig', 'Lining', '347 SS clad',
   'Hydrotreating reactor. 60" ID, 32'' T/T. 2 catalyst beds. 347 clad. Div.2 design. Long lead - design in progress.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"62 inch"},{"name":"ID","value":"60 inch"},{"name":"Thickness","value":"38mm"},{"name":"Material","value":"SA-387 Gr.11 Cl.2"},{"name":"Cladding","value":"347 SS 3mm"},{"name":"Design Code","value":"ASME VIII Div.2"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"},{"name":"Thickness","value":"42mm"},{"name":"Cladding","value":"347 SS 3mm"}]},{"name":"Internals","customFields":[{"name":"Catalyst Beds","value":"2"},{"name":"Support Grid","value":"Inconel 600"}]}]'::jsonb, CURRENT_DATE - 14),
  -- V-301 HP Separator
  (v_project_id, 'Separator', 'V-301', 'JOB-HPCL-2156-07', 'HP Separator - Horizontal', 'HP Separator', '54" ID x 22'' T/T', 'SA-516 Gr.70', 'ASME VIII Div.1', 'in-progress', 48, 'fabrication', 'Vikram Sharma', 'Ramesh Patel', 'Anil Deshmukh', 'Gaurav Singh', 'Shop A - Bay 1', 'Head-to-shell weld - RT', CURRENT_DATE + INTERVAL '6 days', 'high',
   'Design Pressure', '280 psig', 'Design Temp', '750°F', 'MAWP', '308 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '420 psig', 'Operating Pressure', '250 psig', 'Retention Time', '6 min', 'Demister', 'Yes',
   'HP separator 54" ID, 22'' T/T. Demister pad. 4'' inlet, 2x 5'' liquid, 1x 6'' vapour. Shell rolling done.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"56 inch"},{"name":"ID","value":"54 inch"},{"name":"Thickness","value":"14.3mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Corrosion Allowance","value":"3mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"},{"name":"Thickness","value":"15.9mm"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"280 psig"},{"name":"Design Temp","value":"750°F"},{"name":"MAWP","value":"308 psig"},{"name":"Retention Time","value":"6 min"}]},{"name":"Internals","customFields":[{"name":"Demister","value":"Yes"},{"name":"Inlet","value":"4 inch"},{"name":"Liquid Outlets","value":"2x 5 inch"},{"name":"Vapour Outlet","value":"6 inch"}]}]'::jsonb, CURRENT_DATE - 3),
  -- D-401 Reflux Drum
  (v_project_id, 'Drum', 'D-401', 'JOB-HPCL-2156-08', 'Reflux Drum - Horizontal', 'Reflux Drum', '36" ID x 14'' T/T', 'SA-516 Gr.70', 'ASME VIII Div.1', 'completed', 100, 'completed', 'Vikram Sharma', 'Suresh Kumar', 'Anil Deshmukh', 'Gaurav Singh', 'Shipped', 'Final dossier submission', CURRENT_DATE - 5, 'medium',
   'Design Pressure', '55 psig', 'Design Temp', '450°F', 'MAWP', '60 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '82 psig', 'Operating Pressure', '42 psig', 'Liquid Level', '55%', 'Status', 'Shipped',
   'Reflux drum. Shipped to site. Final dossier under compilation. FAT completed.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"38 inch"},{"name":"ID","value":"36 inch"},{"name":"Thickness","value":"9.5mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Corrosion Allowance","value":"3mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"},{"name":"Thickness","value":"10.3mm"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"55 psig"},{"name":"Design Temp","value":"450°F"},{"name":"MAWP","value":"60 psig"}]}]'::jsonb, CURRENT_DATE - 5),
  -- T-501 Feed Tank
  (v_project_id, 'Storage Tank', 'T-501', 'JOB-HPCL-2156-09', 'Feed Storage Tank - 5000 gal', 'Feed Tank', '96" ID x 12'' - 5000 gal', 'SA-516 Gr.70', 'ASME VIII Div.1', 'documentation', 22, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'GA Rev-01 submission', CURRENT_DATE + INTERVAL '15 days', 'medium',
   'Design Pressure', '15 psig', 'Design Temp', '250°F', 'MAWP', '18 psig', 'Capacity', '5000 gal', 'Corrosion Allowance', '3mm', 'Hydro Test', '22 psig', 'Roof Type', 'Fixed', 'Operating Pressure', '5 psig',
   'Feed tank 96" ID, 12'' T/T. 5000 gal. Fixed roof. 2x 4'' nozzles. Simple vessel - documentation in progress.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"98 inch"},{"name":"ID","value":"96 inch"},{"name":"Thickness","value":"6.4mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"T/T","value":"12 ft"},{"name":"Capacity","value":"5000 gal"}]},{"name":"Roof","customFields":[{"name":"Type","value":"Fixed"},{"name":"Material","value":"SA-516 Gr.70"}]},{"name":"Nozzles","customFields":[{"name":"Inlet/Outlet","value":"2x 4 inch"}]}]'::jsonb, CURRENT_DATE - 8),
  -- S-101 Pump Skid
  (v_project_id, 'Skid', 'S-101', 'JOB-HPCL-2156-10', 'Centrifugal Pump Skid Package', 'Pump Skid Package', '12'' x 8'' x 6'' base', 'CS base, SS316 pump', 'ASME B31.3', 'pending', 5, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Pending', 'P&ID & GA approval', CURRENT_DATE + INTERVAL '28 days', 'low',
   'Design Pressure', '150 psig', 'Design Temp', '350°F', 'Pump Type', 'Centrifugal', 'Material', 'SS316', 'Base', 'Carbon steel', 'Piping', 'B31.3', 'Hydro Test', '225 psig', 'Status', 'Design',
   'Pump skid with SS316 centrifugal pump. Carbon steel base. Piping per B31.3. Awaiting P&ID.', v_user_id,
   '[{"name":"Pump","customFields":[{"name":"Type","value":"Centrifugal"},{"name":"Material","value":"SS316"},{"name":"Design Pressure","value":"150 psig"},{"name":"Design Temp","value":"350°F"}]},{"name":"Skid Base","customFields":[{"name":"Material","value":"Carbon steel"},{"name":"Dimensions","value":"12'' x 8'' x 6''"},{"name":"Piping Code","value":"B31.3"}]}]'::jsonb, CURRENT_DATE - 12);

  -- Store equipment IDs for later use (get in order)
  v_equip_ids := ARRAY(
    SELECT id FROM public.equipment WHERE project_id = v_project_id ORDER BY tag_number
  );

  -- ========== 3. EQUIPMENT TEAM POSITIONS (equipment-specific: who works on each equipment at what position) ==========
  -- V-101 (fabrication): full shop team
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'V-101'
  LOOP
    INSERT INTO public.equipment_team_positions (equipment_id, position_name, person_name, email, phone, role) VALUES
    (v_equip_id, 'Project Manager', 'Gaurav Singh', 'gaurav.singh@company.com', '+91-98765-43200', 'editor'),
    (v_equip_id, 'VDCR Manager', 'Arun Nair', 'arun.nair@company.com', '+91-98765-43211', 'editor'),
    (v_equip_id, 'Supervisor', 'Vikram Sharma', 'vikram.sharma@company.com', '+91-98765-43212', 'editor'),
    (v_equip_id, 'Fabricator', 'Ramesh Patel', 'ramesh.patel@company.com', '+91-98765-43213', 'editor'),
    (v_equip_id, 'Welder', 'Suresh Kumar', 'suresh.kumar@company.com', '+91-98765-43214', 'editor'),
    (v_equip_id, 'QC Inspector', 'Anil Deshmukh', 'anil.deshmukh@company.com', '+91-98765-43215', 'editor'),
    (v_equip_id, 'Design Engineer', 'Priya Mehta', 'priya.mehta@company.com', '+91-98765-43210', 'editor'),
    (v_equip_id, 'Documentation Lead', 'Kavita Rao', 'kavita.rao@company.com', '+91-98765-43216', 'editor');
  END LOOP;
  -- V-102 (documentation): design & doc team, no welder yet
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'V-102'
  LOOP
    INSERT INTO public.equipment_team_positions (equipment_id, position_name, person_name, email, phone, role) VALUES
    (v_equip_id, 'Project Manager', 'Gaurav Singh', 'gaurav.singh@company.com', '+91-98765-43200', 'editor'),
    (v_equip_id, 'VDCR Manager', 'Arun Nair', 'arun.nair@company.com', '+91-98765-43211', 'editor'),
    (v_equip_id, 'Supervisor', 'Vikram Sharma', 'vikram.sharma@company.com', '+91-98765-43212', 'editor'),
    (v_equip_id, 'Design Engineer', 'Priya Mehta', 'priya.mehta@company.com', '+91-98765-43210', 'editor'),
    (v_equip_id, 'Documentation Lead', 'Kavita Rao', 'kavita.rao@company.com', '+91-98765-43216', 'editor'),
    (v_equip_id, 'QC Inspector', 'Anil Deshmukh', 'anil.deshmukh@company.com', '+91-98765-43215', 'editor');
  END LOOP;
  -- E-201 (fabrication): full team
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'E-201'
  LOOP
    INSERT INTO public.equipment_team_positions (equipment_id, position_name, person_name, email, phone, role) VALUES
    (v_equip_id, 'Project Manager', 'Gaurav Singh', 'gaurav.singh@company.com', '+91-98765-43200', 'editor'),
    (v_equip_id, 'VDCR Manager', 'Arun Nair', 'arun.nair@company.com', '+91-98765-43211', 'editor'),
    (v_equip_id, 'Supervisor', 'Vikram Sharma', 'vikram.sharma@company.com', '+91-98765-43212', 'editor'),
    (v_equip_id, 'Fabricator', 'Suresh Kumar', 'suresh.kumar@company.com', '+91-98765-43214', 'editor'),
    (v_equip_id, 'Welder', 'Ramesh Patel', 'ramesh.patel@company.com', '+91-98765-43213', 'editor'),
    (v_equip_id, 'QC Inspector', 'Anil Deshmukh', 'anil.deshmukh@company.com', '+91-98765-43215', 'editor'),
    (v_equip_id, 'Design Engineer', 'Priya Mehta', 'priya.mehta@company.com', '+91-98765-43210', 'editor'),
    (v_equip_id, 'Documentation Lead', 'Kavita Rao', 'kavita.rao@company.com', '+91-98765-43216', 'editor');
  END LOOP;
  -- E-202, C-301, R-401 (documentation/pending): design & doc team
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number IN ('E-202','C-301','R-401')
  LOOP
    INSERT INTO public.equipment_team_positions (equipment_id, position_name, person_name, email, phone, role) VALUES
    (v_equip_id, 'Project Manager', 'Gaurav Singh', 'gaurav.singh@company.com', '+91-98765-43200', 'editor'),
    (v_equip_id, 'VDCR Manager', 'Arun Nair', 'arun.nair@company.com', '+91-98765-43211', 'editor'),
    (v_equip_id, 'Supervisor', 'Vikram Sharma', 'vikram.sharma@company.com', '+91-98765-43212', 'editor'),
    (v_equip_id, 'Design Engineer', 'Priya Mehta', 'priya.mehta@company.com', '+91-98765-43210', 'editor'),
    (v_equip_id, 'Documentation Lead', 'Kavita Rao', 'kavita.rao@company.com', '+91-98765-43216', 'editor'),
    (v_equip_id, 'QC Inspector', 'Anil Deshmukh', 'anil.deshmukh@company.com', '+91-98765-43215', 'editor');
  END LOOP;
  -- V-301 (fabrication): full shop team
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'V-301'
  LOOP
    INSERT INTO public.equipment_team_positions (equipment_id, position_name, person_name, email, phone, role) VALUES
    (v_equip_id, 'Project Manager', 'Gaurav Singh', 'gaurav.singh@company.com', '+91-98765-43200', 'editor'),
    (v_equip_id, 'VDCR Manager', 'Arun Nair', 'arun.nair@company.com', '+91-98765-43211', 'editor'),
    (v_equip_id, 'Supervisor', 'Vikram Sharma', 'vikram.sharma@company.com', '+91-98765-43212', 'editor'),
    (v_equip_id, 'Fabricator', 'Ramesh Patel', 'ramesh.patel@company.com', '+91-98765-43213', 'editor'),
    (v_equip_id, 'Welder', 'Suresh Kumar', 'suresh.kumar@company.com', '+91-98765-43214', 'editor'),
    (v_equip_id, 'QC Inspector', 'Anil Deshmukh', 'anil.deshmukh@company.com', '+91-98765-43215', 'editor'),
    (v_equip_id, 'Design Engineer', 'Priya Mehta', 'priya.mehta@company.com', '+91-98765-43210', 'editor'),
    (v_equip_id, 'Documentation Lead', 'Kavita Rao', 'kavita.rao@company.com', '+91-98765-43216', 'editor');
  END LOOP;
  -- D-401 (completed): PM, VDCR, QC, Documentation
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'D-401'
  LOOP
    INSERT INTO public.equipment_team_positions (equipment_id, position_name, person_name, email, phone, role) VALUES
    (v_equip_id, 'Project Manager', 'Gaurav Singh', 'gaurav.singh@company.com', '+91-98765-43200', 'editor'),
    (v_equip_id, 'VDCR Manager', 'Arun Nair', 'arun.nair@company.com', '+91-98765-43211', 'editor'),
    (v_equip_id, 'Supervisor', 'Vikram Sharma', 'vikram.sharma@company.com', '+91-98765-43212', 'editor'),
    (v_equip_id, 'QC Inspector', 'Anil Deshmukh', 'anil.deshmukh@company.com', '+91-98765-43215', 'editor'),
    (v_equip_id, 'Documentation Lead', 'Kavita Rao', 'kavita.rao@company.com', '+91-98765-43216', 'editor');
  END LOOP;
  -- T-501, S-101 (documentation): design & doc team
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number IN ('T-501','S-101')
  LOOP
    INSERT INTO public.equipment_team_positions (equipment_id, position_name, person_name, email, phone, role) VALUES
    (v_equip_id, 'Project Manager', 'Gaurav Singh', 'gaurav.singh@company.com', '+91-98765-43200', 'editor'),
    (v_equip_id, 'VDCR Manager', 'Arun Nair', 'arun.nair@company.com', '+91-98765-43211', 'editor'),
    (v_equip_id, 'Supervisor', 'Vikram Sharma', 'vikram.sharma@company.com', '+91-98765-43212', 'editor'),
    (v_equip_id, 'Design Engineer', 'Priya Mehta', 'priya.mehta@company.com', '+91-98765-43210', 'editor'),
    (v_equip_id, 'Documentation Lead', 'Kavita Rao', 'kavita.rao@company.com', '+91-98765-43216', 'editor'),
    (v_equip_id, 'QC Inspector', 'Anil Deshmukh', 'anil.deshmukh@company.com', '+91-98765-43215', 'editor');
  END LOOP;

  -- ========== 4. EQUIPMENT PROGRESS ENTRIES (updates - specific per equipment) ==========
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'V-101'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'Datasheet Rev-04 approved. Proceeding to fabrication.', 'milestone'),
    (v_equip_id, 'Shell plates received - SA-516 Gr.70. MTR verified. Rolling in progress.', 'update'),
    (v_equip_id, 'Shell rolling completed. Fit-up for longitudinal seam weld.', 'update'),
    (v_equip_id, 'Longitudinal seam weld complete. RT cleared. Circumferential weld in progress.', 'update'),
    (v_equip_id, 'Weld joint 4 under UT. Results expected tomorrow.', 'update');
  END LOOP;

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'V-102'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'Datasheet Rev-02 submitted to client. Awaiting approval.', 'milestone'),
    (v_equip_id, 'GA drawing Rev-01 in progress. Nozzle schedule finalised.', 'update');
  END LOOP;

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'E-201'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'Shell complete. Tube bundle fabrication 80% done.', 'update'),
    (v_equip_id, 'Tubes received. Bundle assembly in progress. Baffles installed.', 'update'),
    (v_equip_id, 'Bundle fit-up scheduled for next week. Hydro test procedure approved.', 'update');
  END LOOP;

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'E-202'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'P&ID Rev-03 received. Incorporating comments.', 'update'),
    (v_equip_id, 'Material PO placed. Lead time 8 weeks.', 'update');
  END LOOP;

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'C-301'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'Datasheet Rev-00 in preparation. Tray layout finalised.', 'update'),
    (v_equip_id, 'Client confirmed tray spacing. Proceeding to GA.', 'milestone');
  END LOOP;

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'R-401'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'Design calculation Rev-01 under client review.', 'update');
  END LOOP;

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'V-301'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'Head-to-shell weld complete. RT scheduled.', 'update'),
    (v_equip_id, 'Shell and heads received. Fit-up in progress.', 'update');
  END LOOP;

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'D-401'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'Shipped to site. Final dossier compilation.', 'milestone'),
    (v_equip_id, 'FAT completed. Client sign-off received.', 'update');
  END LOOP;

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'T-501'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'GA Rev-00 in progress. Simple vessel.', 'update');
  END LOOP;

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'S-101'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'P&ID under development. Pump datasheet received.', 'update');
  END LOOP;

  -- ========== 5. EQUIPMENT DOCUMENTS (more docs per equipment - specific to type) ==========
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'V-101'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'V-101-Datasheet-Rev04', 'https://storage.example.com/docs/V-101-Datasheet-Rev04.pdf', 'datasheet'),
    (v_equip_id, 'V-101-General-Arrangement-Rev02', 'https://storage.example.com/docs/V-101-GA-Rev02.pdf', 'drawing'),
    (v_equip_id, 'V-101-Fabrication-Drawing-Rev05', 'https://storage.example.com/docs/V-101-Fab-Drawing-Rev05.pdf', 'drawing'),
    (v_equip_id, 'V-101-MTR-Shell-Plates', 'https://storage.example.com/docs/V-101-MTR-Shell.pdf', 'mtr'),
    (v_equip_id, 'V-101-MTR-Heads', 'https://storage.example.com/docs/V-101-MTR-Heads.pdf', 'mtr'),
    (v_equip_id, 'V-101-WPS-PQR', 'https://storage.example.com/docs/V-101-WPS-PQR.pdf', 'wps'),
    (v_equip_id, 'V-101-Weld-Map', 'https://storage.example.com/docs/V-101-Weld-Map.pdf', 'drawing'),
    (v_equip_id, 'V-101-Test-Procedure', 'https://storage.example.com/docs/V-101-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'V-101-Hydro-Test-Certificate', 'https://storage.example.com/docs/V-101-Hydro-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-101-Test-Certificate', 'https://storage.example.com/docs/V-101-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-101-NDT-Report-RT', 'https://storage.example.com/docs/V-101-NDT-RT.pdf', 'report'),
    (v_equip_id, 'V-101-NDT-Report-UT', 'https://storage.example.com/docs/V-101-NDT-UT.pdf', 'report'),
    (v_equip_id, 'V-101-NDT-Certificate', 'https://storage.example.com/docs/V-101-NDT-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-101-Material-Test-Certificate', 'https://storage.example.com/docs/V-101-MTC.pdf', 'certificate'),
    (v_equip_id, 'V-101-Calibration-Certificate', 'https://storage.example.com/docs/V-101-Calibration-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'V-102'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'V-102-Datasheet-Rev02', 'https://storage.example.com/docs/V-102-Datasheet-Rev02.pdf', 'datasheet'),
    (v_equip_id, 'V-102-General-Arrangement-Rev01', 'https://storage.example.com/docs/V-102-GA-Rev01.pdf', 'drawing'),
    (v_equip_id, 'V-102-Design-Calculation', 'https://storage.example.com/docs/V-102-Design-Calc.pdf', 'calculation'),
    (v_equip_id, 'V-102-Test-Procedure', 'https://storage.example.com/docs/V-102-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'V-102-Test-Certificate', 'https://storage.example.com/docs/V-102-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-102-Hydro-Test-Certificate', 'https://storage.example.com/docs/V-102-Hydro-Test-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'E-201'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'E-201-Datasheet-Rev03', 'https://storage.example.com/docs/E-201-Datasheet-Rev03.pdf', 'datasheet'),
    (v_equip_id, 'E-201-Shell-Drawing', 'https://storage.example.com/docs/E-201-Shell-Drawing.pdf', 'drawing'),
    (v_equip_id, 'E-201-Tube-Bundle-Drawing', 'https://storage.example.com/docs/E-201-Tube-Bundle-Drawing.pdf', 'drawing'),
    (v_equip_id, 'E-201-MTR-Shell', 'https://storage.example.com/docs/E-201-MTR-Shell.pdf', 'mtr'),
    (v_equip_id, 'E-201-MTR-Tubes', 'https://storage.example.com/docs/E-201-MTR-Tubes.pdf', 'mtr'),
    (v_equip_id, 'E-201-Tube-Layout', 'https://storage.example.com/docs/E-201-Tube-Layout.pdf', 'drawing'),
    (v_equip_id, 'E-201-Test-Procedure', 'https://storage.example.com/docs/E-201-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'E-201-Hydro-Test-Certificate', 'https://storage.example.com/docs/E-201-Hydro-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'E-201-Test-Certificate', 'https://storage.example.com/docs/E-201-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'E-201-Pressure-Test-Report', 'https://storage.example.com/docs/E-201-Pressure-Test.pdf', 'report'),
    (v_equip_id, 'E-201-NDT-Certificate', 'https://storage.example.com/docs/E-201-NDT-Cert.pdf', 'certificate'),
    (v_equip_id, 'E-201-Material-Test-Certificate', 'https://storage.example.com/docs/E-201-MTC.pdf', 'certificate'),
    (v_equip_id, 'E-201-Calibration-Certificate', 'https://storage.example.com/docs/E-201-Calibration-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'E-202'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'E-202-Datasheet-Rev00', 'https://storage.example.com/docs/E-202-Datasheet-Rev00.pdf', 'datasheet'),
    (v_equip_id, 'E-202-Bayonet-Detail', 'https://storage.example.com/docs/E-202-Bayonet-Detail.pdf', 'drawing'),
    (v_equip_id, 'E-202-Test-Procedure', 'https://storage.example.com/docs/E-202-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'E-202-Test-Certificate', 'https://storage.example.com/docs/E-202-Test-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'C-301'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'C-301-Datasheet-Rev00', 'https://storage.example.com/docs/C-301-Datasheet-Rev00.pdf', 'datasheet'),
    (v_equip_id, 'C-301-Tray-Layout', 'https://storage.example.com/docs/C-301-Tray-Layout.pdf', 'drawing'),
    (v_equip_id, 'C-301-Material-Take-Off', 'https://storage.example.com/docs/C-301-MTO.pdf', 'mto'),
    (v_equip_id, 'C-301-Test-Procedure', 'https://storage.example.com/docs/C-301-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'C-301-Test-Certificate', 'https://storage.example.com/docs/C-301-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'C-301-Hydro-Test-Certificate', 'https://storage.example.com/docs/C-301-Hydro-Test-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'V-301'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'V-301-Datasheet-Rev05', 'https://storage.example.com/docs/V-301-Datasheet-Rev05.pdf', 'datasheet'),
    (v_equip_id, 'V-301-Fabrication-Drawing-Rev07', 'https://storage.example.com/docs/V-301-Fab-Drawing-Rev07.pdf', 'drawing'),
    (v_equip_id, 'V-301-MTR-Shell', 'https://storage.example.com/docs/V-301-MTR-Shell.pdf', 'mtr'),
    (v_equip_id, 'V-301-WPS-PQR', 'https://storage.example.com/docs/V-301-WPS-PQR.pdf', 'wps'),
    (v_equip_id, 'V-301-NDT-Report-RT', 'https://storage.example.com/docs/V-301-NDT-RT.pdf', 'report'),
    (v_equip_id, 'V-301-NDT-Certificate', 'https://storage.example.com/docs/V-301-NDT-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-301-Material-Test-Certificate', 'https://storage.example.com/docs/V-301-MTC.pdf', 'certificate'),
    (v_equip_id, 'V-301-Test-Certificate', 'https://storage.example.com/docs/V-301-Test-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'D-401'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'D-401-Final-Dossier', 'https://storage.example.com/docs/D-401-Final-Dossier.pdf', 'dossier'),
    (v_equip_id, 'D-401-NDT-Report', 'https://storage.example.com/docs/D-401-NDT-Report.pdf', 'report'),
    (v_equip_id, 'D-401-Hydro-Test-Report', 'https://storage.example.com/docs/D-401-Hydro-Report.pdf', 'report'),
    (v_equip_id, 'D-401-Hydro-Test-Certificate', 'https://storage.example.com/docs/D-401-Hydro-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'D-401-MTR-Package', 'https://storage.example.com/docs/D-401-MTR-Package.pdf', 'mtr'),
    (v_equip_id, 'D-401-Material-Test-Certificate', 'https://storage.example.com/docs/D-401-MTC.pdf', 'certificate'),
    (v_equip_id, 'D-401-Fitness-Certificate', 'https://storage.example.com/docs/D-401-Fitness-Cert.pdf', 'certificate'),
    (v_equip_id, 'D-401-Calibration-Certificate', 'https://storage.example.com/docs/D-401-Calibration-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'R-401'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'R-401-Design-Calculation-Rev02', 'https://storage.example.com/docs/R-401-Design-Calc.pdf', 'calculation'),
    (v_equip_id, 'R-401-Datasheet-Rev00', 'https://storage.example.com/docs/R-401-Datasheet.pdf', 'datasheet'),
    (v_equip_id, 'R-401-Test-Procedure', 'https://storage.example.com/docs/R-401-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'R-401-Test-Certificate', 'https://storage.example.com/docs/R-401-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'R-401-NDT-Certificate', 'https://storage.example.com/docs/R-401-NDT-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'T-501'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'T-501-Datasheet-Rev00', 'https://storage.example.com/docs/T-501-Datasheet.pdf', 'datasheet'),
    (v_equip_id, 'T-501-GA-Rev01', 'https://storage.example.com/docs/T-501-GA.pdf', 'drawing'),
    (v_equip_id, 'T-501-Test-Procedure', 'https://storage.example.com/docs/T-501-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'T-501-Test-Certificate', 'https://storage.example.com/docs/T-501-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'T-501-Hydro-Test-Certificate', 'https://storage.example.com/docs/T-501-Hydro-Test-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id AND tag_number = 'S-101'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'S-101-PID-Rev00', 'https://storage.example.com/docs/S-101-PID.pdf', 'drawing'),
    (v_equip_id, 'S-101-Pump-Datasheet', 'https://storage.example.com/docs/S-101-Pump-Datasheet.pdf', 'datasheet'),
    (v_equip_id, 'S-101-Pump-Calibration-Certificate', 'https://storage.example.com/docs/S-101-Calibration-Cert.pdf', 'certificate'),
    (v_equip_id, 'S-101-Test-Procedure', 'https://storage.example.com/docs/S-101-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'S-101-Test-Certificate', 'https://storage.example.com/docs/S-101-Test-Cert.pdf', 'certificate');
  END LOOP;

  -- ========== 6. VDCR RECORDS (35 entries) - mfg_serial_numbers = equipment titles ==========
  INSERT INTO public.vdcr_records (project_id, firm_id, sr_no, equipment_tag_numbers, mfg_serial_numbers, job_numbers, client_doc_no, internal_doc_no, document_name, revision, code_status, status, department, remarks, project_documentation_start_date)
  VALUES
  (v_project_id, v_firm_id, '1', ARRAY['V-101'], ARRAY['Primary Crude Separator - 72" Vessel'], ARRAY['JOB-HPCL-2156-01'], 'HPCL-DOC-101', 'VDCR-2156-001', 'Datasheet', 'Rev-04', 'Code 1', 'approved', 'Mechanical', 'Approved as per Rev-04.', CURRENT_DATE - INTERVAL '70 days'),
  (v_project_id, v_firm_id, '2', ARRAY['V-101'], ARRAY['Primary Crude Separator - 72" Vessel'], ARRAY['JOB-HPCL-2156-01'], 'HPCL-DOC-102', 'VDCR-2156-002', 'General Arrangement', 'Rev-05', 'Code 2', 'approved', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '65 days'),
  (v_project_id, v_firm_id, '3', ARRAY['V-101'], ARRAY['Primary Crude Separator - 72" Vessel'], ARRAY['JOB-HPCL-2156-01'], 'HPCL-DOC-103', 'VDCR-2156-003', 'Fabrication Drawing', 'Rev-11', 'Code 1', 'sent-for-approval', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '85 days'),
  (v_project_id, v_firm_id, '4', ARRAY['V-101'], ARRAY['Primary Crude Separator - 72" Vessel'], ARRAY['JOB-HPCL-2156-01'], 'HPCL-DOC-104', 'VDCR-2156-004', 'MTR', 'Rev-00', 'Code 3', 'approved', 'Quality', 'For information.', CURRENT_DATE - INTERVAL '12 days'),
  (v_project_id, v_firm_id, '5', ARRAY['V-101'], ARRAY['Primary Crude Separator - 72" Vessel'], ARRAY['JOB-HPCL-2156-01'], 'HPCL-DOC-105', 'VDCR-2156-005', 'WPS/PQR', 'Rev-02', 'Code 2', 'approved', 'Quality', NULL, CURRENT_DATE - INTERVAL '50 days'),
  (v_project_id, v_firm_id, '6', ARRAY['V-101'], ARRAY['Primary Crude Separator - 72" Vessel'], ARRAY['JOB-HPCL-2156-01'], 'HPCL-DOC-106', 'VDCR-2156-006', 'Design Calculation', 'Rev-06', 'Code 2', 'approved', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '60 days'),
  (v_project_id, v_firm_id, '7', ARRAY['V-102'], ARRAY['Flash Drum - 48" Horizontal'], ARRAY['JOB-HPCL-2156-02'], 'HPCL-DOC-107', 'VDCR-2156-007', 'Datasheet', 'Rev-02', 'Code 1', 'received-for-comment', 'Mechanical', 'Minor comments on nozzle N2 orientation.', CURRENT_DATE - INTERVAL '18 days'),
  (v_project_id, v_firm_id, '8', ARRAY['V-102'], ARRAY['Flash Drum - 48" Horizontal'], ARRAY['JOB-HPCL-2156-02'], 'HPCL-DOC-108', 'VDCR-2156-008', 'P&ID', 'Rev-08', 'Code 1', 'approved', 'Process', NULL, CURRENT_DATE - INTERVAL '55 days'),
  (v_project_id, v_firm_id, '9', ARRAY['V-102'], ARRAY['Flash Drum - 48" Horizontal'], ARRAY['JOB-HPCL-2156-02'], 'HPCL-DOC-109', 'VDCR-2156-009', 'General Arrangement', 'Rev-02', 'Code 2', 'approved', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '30 days'),
  (v_project_id, v_firm_id, '10', ARRAY['E-201'], ARRAY['Titanium Shell & Tube Heat Exchanger'], ARRAY['JOB-HPCL-2156-03'], 'HPCL-DOC-110', 'VDCR-2156-010', 'Datasheet', 'Rev-03', 'Code 1', 'approved', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '45 days'),
  (v_project_id, v_firm_id, '11', ARRAY['E-201'], ARRAY['Titanium Shell & Tube Heat Exchanger'], ARRAY['JOB-HPCL-2156-03'], 'HPCL-DOC-111', 'VDCR-2156-011', 'Tube Bundle Drawing', 'Rev-04', 'Code 2', 'approved', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '40 days'),
  (v_project_id, v_firm_id, '12', ARRAY['E-201'], ARRAY['Titanium Shell & Tube Heat Exchanger'], ARRAY['JOB-HPCL-2156-03'], 'HPCL-DOC-112', 'VDCR-2156-012', 'Design Calculation', 'Rev-05', 'Code 2', 'approved', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '50 days'),
  (v_project_id, v_firm_id, '13', ARRAY['E-202'], ARRAY['Bayonet Type Overhead Condenser'], ARRAY['JOB-HPCL-2156-04'], 'HPCL-DOC-113', 'VDCR-2156-013', 'Datasheet', 'Rev-00', 'Code 1', 'pending', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '5 days'),
  (v_project_id, v_firm_id, '14', ARRAY['E-202'], ARRAY['Bayonet Type Overhead Condenser'], ARRAY['JOB-HPCL-2156-04'], 'HPCL-DOC-114', 'VDCR-2156-014', 'P&ID', 'Rev-04', 'Code 1', 'received-for-comment', 'Process', 'Update inlet nozzle size.', CURRENT_DATE - INTERVAL '25 days'),
  (v_project_id, v_firm_id, '15', ARRAY['C-301'], ARRAY['Fractionator Column - 18 Tray'], ARRAY['JOB-HPCL-2156-05'], 'HPCL-DOC-115', 'VDCR-2156-015', 'Datasheet', 'Rev-00', 'Code 1', 'pending', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '8 days'),
  (v_project_id, v_firm_id, '16', ARRAY['C-301'], ARRAY['Fractionator Column - 18 Tray'], ARRAY['JOB-HPCL-2156-05'], 'HPCL-DOC-116', 'VDCR-2156-016', 'P&ID', 'Rev-06', 'Code 1', 'approved', 'Process', NULL, CURRENT_DATE - INTERVAL '35 days'),
  (v_project_id, v_firm_id, '17', ARRAY['C-301'], ARRAY['Fractionator Column - 18 Tray'], ARRAY['JOB-HPCL-2156-05'], 'HPCL-DOC-117', 'VDCR-2156-017', 'Tray Layout', 'Rev-02', 'Code 2', 'approved', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '28 days'),
  (v_project_id, v_firm_id, '18', ARRAY['R-401'], ARRAY['Hydrotreating Reactor - 2 Catalyst Bed'], ARRAY['JOB-HPCL-2156-06'], 'HPCL-DOC-118', 'VDCR-2156-018', 'Design Calculation', 'Rev-02', 'Code 1', 'received-for-comment', 'Mechanical', 'Revise thickness per client comment.', CURRENT_DATE - INTERVAL '20 days'),
  (v_project_id, v_firm_id, '19', ARRAY['R-401'], ARRAY['Hydrotreating Reactor - 2 Catalyst Bed'], ARRAY['JOB-HPCL-2156-06'], 'HPCL-DOC-119', 'VDCR-2156-019', 'Datasheet', 'Rev-00', 'Code 1', 'pending', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '12 days'),
  (v_project_id, v_firm_id, '20', ARRAY['V-301'], ARRAY['HP Separator - Horizontal'], ARRAY['JOB-HPCL-2156-07'], 'HPCL-DOC-120', 'VDCR-2156-020', 'Datasheet', 'Rev-05', 'Code 1', 'approved', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '55 days'),
  (v_project_id, v_firm_id, '21', ARRAY['V-301'], ARRAY['HP Separator - Horizontal'], ARRAY['JOB-HPCL-2156-07'], 'HPCL-DOC-121', 'VDCR-2156-021', 'Fabrication Drawing', 'Rev-07', 'Code 1', 'sent-for-approval', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '70 days'),
  (v_project_id, v_firm_id, '22', ARRAY['V-301'], ARRAY['HP Separator - Horizontal'], ARRAY['JOB-HPCL-2156-07'], 'HPCL-DOC-122', 'VDCR-2156-022', 'MTR', 'Rev-00', 'Code 3', 'approved', 'Quality', NULL, CURRENT_DATE - INTERVAL '15 days'),
  (v_project_id, v_firm_id, '23', ARRAY['D-401'], ARRAY['Reflux Drum - Horizontal'], ARRAY['JOB-HPCL-2156-08'], 'HPCL-DOC-123', 'VDCR-2156-023', 'Final Dossier', 'Rev-01', 'Code 4', 'approved', 'Documentation', 'As-built submitted.', CURRENT_DATE - INTERVAL '60 days'),
  (v_project_id, v_firm_id, '24', ARRAY['D-401'], ARRAY['Reflux Drum - Horizontal'], ARRAY['JOB-HPCL-2156-08'], 'HPCL-DOC-124', 'VDCR-2156-024', 'NDT Report', 'Rev-00', 'Code 3', 'approved', 'Quality', NULL, CURRENT_DATE - INTERVAL '25 days'),
  (v_project_id, v_firm_id, '25', ARRAY['D-401'], ARRAY['Reflux Drum - Horizontal'], ARRAY['JOB-HPCL-2156-08'], 'HPCL-DOC-125', 'VDCR-2156-025', 'Hydro Test Report', 'Rev-00', 'Code 3', 'approved', 'Quality', NULL, CURRENT_DATE - INTERVAL '20 days'),
  (v_project_id, v_firm_id, '26', ARRAY['T-501'], ARRAY['Feed Storage Tank - 5000 gal'], ARRAY['JOB-HPCL-2156-09'], 'HPCL-DOC-126', 'VDCR-2156-026', 'Datasheet', 'Rev-00', 'Code 1', 'pending', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '6 days'),
  (v_project_id, v_firm_id, '27', ARRAY['T-501'], ARRAY['Feed Storage Tank - 5000 gal'], ARRAY['JOB-HPCL-2156-09'], 'HPCL-DOC-127', 'VDCR-2156-027', 'General Arrangement', 'Rev-01', 'Code 2', 'sent-for-approval', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '10 days'),
  (v_project_id, v_firm_id, '28', ARRAY['S-101'], ARRAY['Centrifugal Pump Skid Package'], ARRAY['JOB-HPCL-2156-10'], 'HPCL-DOC-128', 'VDCR-2156-028', 'P&ID', 'Rev-00', 'Code 1', 'pending', 'Process', NULL, CURRENT_DATE - INTERVAL '4 days'),
  (v_project_id, v_firm_id, '29', ARRAY['V-101','V-102','V-301'], ARRAY['Primary Crude Separator - 72" Vessel','Flash Drum - 48" Horizontal','HP Separator - Horizontal'], ARRAY['JOB-HPCL-2156-01','JOB-HPCL-2156-02','JOB-HPCL-2156-07'], 'HPCL-DOC-129', 'VDCR-2156-029', 'Test Procedure', 'Rev-03', 'Code 2', 'approved', 'Quality', NULL, CURRENT_DATE - INTERVAL '40 days'),
  (v_project_id, v_firm_id, '30', ARRAY['V-101'], ARRAY['Primary Crude Separator - 72" Vessel'], ARRAY['JOB-HPCL-2156-01'], 'HPCL-DOC-130', 'VDCR-2156-030', 'Weld Map', 'Rev-02', 'Code 2', 'approved', 'Quality', NULL, CURRENT_DATE - INTERVAL '35 days'),
  (v_project_id, v_firm_id, '31', ARRAY['V-101'], ARRAY['Primary Crude Separator - 72" Vessel'], ARRAY['JOB-HPCL-2156-01'], 'HPCL-DOC-131', 'VDCR-2156-031', 'Hydro Test Report', 'Rev-00', 'Code 3', 'pending', 'Quality', NULL, CURRENT_DATE - INTERVAL '3 days'),
  (v_project_id, v_firm_id, '32', ARRAY['E-201','E-202'], ARRAY['Titanium Shell & Tube Heat Exchanger','Bayonet Type Overhead Condenser'], ARRAY['JOB-HPCL-2156-03','JOB-HPCL-2156-04'], 'HPCL-DOC-132', 'VDCR-2156-032', 'Test Procedure', 'Rev-01', 'Code 2', 'approved', 'Quality', NULL, CURRENT_DATE - INTERVAL '30 days'),
  (v_project_id, v_firm_id, '33', ARRAY['C-301'], ARRAY['Fractionator Column - 18 Tray'], ARRAY['JOB-HPCL-2156-05'], 'HPCL-DOC-133', 'VDCR-2156-033', 'Material Take-Off', 'Rev-00', 'Code 2', 'approved', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '22 days'),
  (v_project_id, v_firm_id, '34', ARRAY['V-301'], ARRAY['HP Separator - Horizontal'], ARRAY['JOB-HPCL-2156-07'], 'HPCL-DOC-134', 'VDCR-2156-034', 'WPS/PQR', 'Rev-01', 'Code 2', 'approved', 'Quality', NULL, CURRENT_DATE - INTERVAL '45 days'),
  (v_project_id, v_firm_id, '35', ARRAY['V-101','V-102','E-201'], ARRAY['Primary Crude Separator - 72" Vessel','Flash Drum - 48" Horizontal','Titanium Shell & Tube Heat Exchanger'], ARRAY['JOB-HPCL-2156-01','JOB-HPCL-2156-02','JOB-HPCL-2156-03'], 'HPCL-DOC-135', 'VDCR-2156-035', 'Project P&ID', 'Rev-12', 'Code 1', 'approved', 'Process', 'Master P&ID approved.', CURRENT_DATE - INTERVAL '80 days');

  -- ========== 7. VDCR REVISION EVENTS (full history for sample VDCRs) ==========
  -- VDCR 1 (V-101 Datasheet) - SAME rev number for submitted+received so UI shows both dates & days calc
  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id AND sr_no = '1'
  LOOP
    INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
    VALUES
    (v_vdcr_id, 'submitted', 'Rev-00', CURRENT_TIMESTAMP - INTERVAL '70 days', CURRENT_TIMESTAMP - INTERVAL '63 days', NULL, NULL, 'Document sent to client for approval. Initial submission.', v_user_id),
    (v_vdcr_id, 'received', 'Rev-00', CURRENT_TIMESTAMP - INTERVAL '63 days', NULL, CURRENT_TIMESTAMP - INTERVAL '63 days', 7, 'Received from client. Comments: Update design pressure to 85 psig, revise nozzle schedule.', v_user_id),
    (v_vdcr_id, 'submitted', 'Rev-01', CURRENT_TIMESTAMP - INTERVAL '56 days', CURRENT_TIMESTAMP - INTERVAL '49 days', NULL, NULL, 'Resubmitted Rev-01 per client comments. Design pressure & nozzle schedule updated.', v_user_id),
    (v_vdcr_id, 'received', 'Rev-01', CURRENT_TIMESTAMP - INTERVAL '49 days', NULL, CURRENT_TIMESTAMP - INTERVAL '49 days', 7, 'Received from client. Minor comments on nozzle N2 orientation.', v_user_id),
    (v_vdcr_id, 'submitted', 'Rev-02', CURRENT_TIMESTAMP - INTERVAL '42 days', CURRENT_TIMESTAMP - INTERVAL '35 days', NULL, NULL, 'Sent Rev-02. Nozzle N2 orientation corrected.', v_user_id),
    (v_vdcr_id, 'received', 'Rev-02', CURRENT_TIMESTAMP - INTERVAL '35 days', NULL, CURRENT_TIMESTAMP - INTERVAL '35 days', 7, 'Received from client. Clad thickness confirmed. One minor edit on liquid level.', v_user_id),
    (v_vdcr_id, 'submitted', 'Rev-03', CURRENT_TIMESTAMP - INTERVAL '28 days', CURRENT_TIMESTAMP - INTERVAL '21 days', NULL, NULL, 'Sent Rev-03. Liquid level updated to 60%.', v_user_id),
    (v_vdcr_id, 'received', 'Rev-03', CURRENT_TIMESTAMP - INTERVAL '21 days', NULL, CURRENT_TIMESTAMP - INTERVAL '21 days', 7, 'Received from client. Minor comments. Resubmit Rev-04.', v_user_id),
    (v_vdcr_id, 'submitted', 'Rev-04', CURRENT_TIMESTAMP - INTERVAL '14 days', CURRENT_TIMESTAMP - INTERVAL '7 days', NULL, NULL, 'Sent Rev-04. Final revision per client comments.', v_user_id),
    (v_vdcr_id, 'received', 'Rev-04', CURRENT_TIMESTAMP - INTERVAL '7 days', NULL, CURRENT_TIMESTAMP - INTERVAL '7 days', 7, 'Received from client. Approved as per Rev-04. No further comments.', v_user_id);
  END LOOP;

  -- VDCR 3 (V-101 Fabrication Drawing) - Rev-00 through Rev-11, same rev for submitted+received, all with event_date for days calc
  -- Timeline: 7 days between sent/received per revision, 7 days with us between revisions
  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id AND sr_no = '3'
  LOOP
    FOR v_i IN 0..11 LOOP
      INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
      VALUES
      (v_vdcr_id, 'submitted', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (85 - v_i * 7), CURRENT_TIMESTAMP - INTERVAL '1 day' * (78 - v_i * 7), NULL, NULL, CASE WHEN v_i = 0 THEN 'Fabrication drawing sent to client for approval.' WHEN v_i < 11 THEN 'Next draft Rev-' || LPAD((v_i)::text, 2, '0') || ' sent per client comments.' ELSE 'Final revision sent.' END, v_user_id),
      (v_vdcr_id, 'received', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (78 - v_i * 7), NULL, CURRENT_TIMESTAMP - INTERVAL '1 day' * (78 - v_i * 7), 7, CASE WHEN v_i < 11 THEN 'Received from client. Comments on weld joints / nozzle details. Resubmit.' ELSE 'Received from client. Approved Rev-11. No further comments.' END, v_user_id);
    END LOOP;
  END LOOP;

  -- VDCR 4 (MTR - simple, for information only)
  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id AND sr_no = '4'
  LOOP
    INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
    VALUES
    (v_vdcr_id, 'submitted', 'Rev-00', CURRENT_TIMESTAMP - INTERVAL '12 days', CURRENT_TIMESTAMP - INTERVAL '8 days', NULL, NULL, 'MTR submitted for information. Code 3 - no formal approval required.', v_user_id),
    (v_vdcr_id, 'received', 'Rev-00', CURRENT_TIMESTAMP - INTERVAL '8 days', NULL, CURRENT_TIMESTAMP - INTERVAL '8 days', 4, 'Received from client. Acknowledged. No action required.', v_user_id);
  END LOOP;

  -- VDCR 7 (V-102 Datasheet) - same rev for submitted+received
  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id AND sr_no = '7'
  LOOP
    INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
    VALUES
    (v_vdcr_id, 'submitted', 'Rev-00', CURRENT_TIMESTAMP - INTERVAL '18 days', CURRENT_TIMESTAMP - INTERVAL '14 days', NULL, NULL, 'Datasheet Rev-00 sent to client for approval.', v_user_id),
    (v_vdcr_id, 'received', 'Rev-00', CURRENT_TIMESTAMP - INTERVAL '14 days', NULL, CURRENT_TIMESTAMP - INTERVAL '14 days', 4, 'Received from client. Comments on nozzle N2 size and orientation.', v_user_id),
    (v_vdcr_id, 'submitted', 'Rev-01', CURRENT_TIMESTAMP - INTERVAL '10 days', CURRENT_TIMESTAMP - INTERVAL '6 days', NULL, NULL, 'Resubmitted Rev-01. Nozzle N2 updated per client comments.', v_user_id),
    (v_vdcr_id, 'received', 'Rev-01', CURRENT_TIMESTAMP - INTERVAL '6 days', NULL, CURRENT_TIMESTAMP - INTERVAL '6 days', 4, 'Received from client. Minor comments on N2 orientation. Final revision in progress.', v_user_id);
  END LOOP;

  -- VDCR 20 (V-301 Datasheet) - Rev-00 through Rev-05, same rev for submitted+received, all with event_date
  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id AND sr_no = '20'
  LOOP
    FOR v_i IN 0..5 LOOP
      INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
      VALUES
      (v_vdcr_id, 'submitted', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (55 - v_i * 8), CURRENT_TIMESTAMP - INTERVAL '1 day' * (48 - v_i * 8), NULL, NULL, CASE WHEN v_i = 0 THEN 'HP Separator datasheet sent to client for approval.' WHEN v_i < 5 THEN 'Next draft Rev-' || LPAD((v_i)::text, 2, '0') || ' sent per client comments.' ELSE 'Final revision sent.' END, v_user_id),
      (v_vdcr_id, 'received', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (48 - v_i * 8), NULL, CURRENT_TIMESTAMP - INTERVAL '1 day' * (48 - v_i * 8), 7, CASE WHEN v_i < 5 THEN 'Received from client. Comments on demister / retention time. Resubmit.' ELSE 'Received from client. Approved Rev-05.' END, v_user_id);
    END LOOP;
  END LOOP;

  -- Add revision events for VDCRs with 6-7 revisions (2, 5, 8, 9, 14, 16, 17, 18, 21, 27, 29, 30, 32, 33, 34) - update record revision to match
  UPDATE public.vdcr_records SET revision = 'Rev-07' WHERE project_id = v_project_id AND sr_no IN ('2','5','8','9','14','16','17','18','21','27','29','30','32','33','34');
  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id AND sr_no IN ('2','5','8','9','14','16','17','18','21','27','29','30','32','33','34')
  LOOP
    FOR v_i IN 0..6 LOOP
      INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
      VALUES
      (v_vdcr_id, 'submitted', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (50 - v_i * 6), CURRENT_TIMESTAMP - INTERVAL '1 day' * (44 - v_i * 6), NULL, NULL, CASE WHEN v_i = 0 THEN 'Document sent to client for approval.' WHEN v_i < 6 THEN 'Rev-' || LPAD((v_i)::text, 2, '0') || ' sent per client comments.' ELSE 'Final revision sent.' END, v_user_id),
      (v_vdcr_id, 'received', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (44 - v_i * 6), NULL, CURRENT_TIMESTAMP - INTERVAL '1 day' * (44 - v_i * 6), 6, CASE WHEN v_i < 6 THEN 'Received from client. Comments incorporated. Resubmit.' ELSE 'Received from client. Approved.' END, v_user_id);
    END LOOP;
  END LOOP;

  -- Add revision events for VDCRs with 10-12 revisions (6, 10, 11, 12, 23, 24, 25, 35) - update record revision to match
  UPDATE public.vdcr_records SET revision = 'Rev-12' WHERE project_id = v_project_id AND sr_no IN ('6','10','11','12','23','24','25','35');
  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id AND sr_no IN ('6','10','11','12','23','24','25','35')
  LOOP
    FOR v_i IN 0..11 LOOP
      INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
      VALUES
      (v_vdcr_id, 'submitted', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (70 - v_i * 5), CURRENT_TIMESTAMP - INTERVAL '1 day' * (65 - v_i * 5), NULL, NULL, CASE WHEN v_i = 0 THEN 'Document sent to client for approval.' WHEN v_i < 11 THEN 'Rev-' || LPAD((v_i)::text, 2, '0') || ' sent per client comments.' ELSE 'Final revision sent.' END, v_user_id),
      (v_vdcr_id, 'received', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (65 - v_i * 5), NULL, CURRENT_TIMESTAMP - INTERVAL '1 day' * (65 - v_i * 5), 5, CASE WHEN v_i < 11 THEN 'Received from client. Comments. Resubmit.' ELSE 'Received from client. Approved.' END, v_user_id);
    END LOOP;
  END LOOP;

  -- Add Rev-00 submitted events for pending VDCRs (13, 15, 19, 26, 28, 31) - doc created & sent, awaiting client
  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id AND sr_no IN ('13','15','19','26','28','31')
  LOOP
    INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
    VALUES
    (v_vdcr_id, 'submitted', 'Rev-00', CURRENT_TIMESTAMP - INTERVAL '3 days', CURRENT_TIMESTAMP + INTERVAL '7 days', NULL, NULL, 'Document created and sent to client for approval. Awaiting response.', v_user_id);
  END LOOP;

  -- ========== 8. VDCR DOCUMENT HISTORY (realistic flow - mirrors revision events) ==========
  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id AND sr_no = '1'
  LOOP
    INSERT INTO public.vdcr_document_history (vdcr_record_id, version_number, action, previous_status, new_status, changed_by, remarks)
    VALUES
    (v_vdcr_id, 'Rev-00', 'created', NULL, 'pending', v_user_id, 'Document created.'),
    (v_vdcr_id, 'Rev-00', 'sent-for-review', 'pending', 'sent-for-approval', v_user_id, 'Document sent to client for approval.'),
    (v_vdcr_id, 'Rev-01', 'received-for-comment', 'sent-for-approval', 'received-for-comment', v_user_id, 'Received from client. Comments on design pressure & nozzle schedule.'),
    (v_vdcr_id, 'Rev-01', 'updated', 'received-for-comment', 'pending', v_user_id, 'Incorporated client comments.'),
    (v_vdcr_id, 'Rev-01', 'sent-for-review', 'pending', 'sent-for-approval', v_user_id, 'Resubmitted Rev-01 to client.'),
    (v_vdcr_id, 'Rev-02', 'received-for-comment', 'sent-for-approval', 'received-for-comment', v_user_id, 'Received from client. Minor comments on nozzle N2.'),
    (v_vdcr_id, 'Rev-02', 'updated', 'received-for-comment', 'pending', v_user_id, 'Nozzle N2 orientation corrected.'),
    (v_vdcr_id, 'Rev-02', 'sent-for-review', 'pending', 'sent-for-approval', v_user_id, 'Sent Rev-02.'),
    (v_vdcr_id, 'Rev-03', 'received-for-comment', 'sent-for-approval', 'received-for-comment', v_user_id, 'Received from client. Clad thickness confirmed.'),
    (v_vdcr_id, 'Rev-03', 'updated', 'received-for-comment', 'pending', v_user_id, 'Liquid level updated.'),
    (v_vdcr_id, 'Rev-03', 'sent-for-review', 'pending', 'sent-for-approval', v_user_id, 'Sent Rev-03.'),
    (v_vdcr_id, 'Rev-04', 'approved', 'sent-for-approval', 'approved', v_user_id, 'Received from client. Approved as per Rev-04.');
  END LOOP;
  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id AND sr_no IN ('3','7')
  LOOP
    INSERT INTO public.vdcr_document_history (vdcr_record_id, version_number, action, previous_status, new_status, changed_by, remarks)
    VALUES
    (v_vdcr_id, 'Rev-00', 'created', NULL, 'pending', v_user_id, 'Document created.'),
    (v_vdcr_id, 'Rev-00', 'sent-for-review', 'pending', 'sent-for-approval', v_user_id, 'Document sent to client for approval.'),
    (v_vdcr_id, 'Rev-01', 'received-for-comment', 'sent-for-approval', 'received-for-comment', v_user_id, 'Received from client. Comments received.'),
    (v_vdcr_id, 'Rev-01', 'updated', 'received-for-comment', 'pending', v_user_id, 'Incorporated comments.'),
    (v_vdcr_id, 'Rev-01', 'sent-for-review', 'pending', 'sent-for-approval', v_user_id, 'Next draft sent to client.'),
    (v_vdcr_id, 'Rev-02', 'approved', 'sent-for-approval', 'approved', v_user_id, 'Approved by client.');
  END LOOP;

  -- ========== 9. PROJECT MEMBERS (with equipment_assignments - assign equipments to each member) ==========
  INSERT INTO public.project_members (project_id, name, email, position, role, status, user_id, equipment_assignments)
  VALUES
  (v_project_id, 'Gaurav Singh', COALESCE((SELECT email FROM public.users WHERE id = v_user_id), 'gaurav.singh@company.com'), 'Project Manager', 'project_manager', 'active', v_user_id, '["All Equipment"]'::jsonb),
  (v_project_id, 'Vikram Sharma', 'vikram.sharma@company.com', 'Fabrication Supervisor', 'editor', 'active', v_user_id, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id AND tag_number = ANY(ARRAY['V-101','V-102','E-201','V-301','D-401']))),
  (v_project_id, 'Priya Mehta', 'priya.mehta@company.com', 'Design Engineer', 'editor', 'active', v_user_id, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id AND tag_number = ANY(ARRAY['V-102','E-202','C-301','R-401','T-501','S-101']))),
  (v_project_id, 'Arun Nair', 'arun.nair@company.com', 'Documentation Lead', 'vdcr_manager', 'active', v_user_id, '["All Equipment"]'::jsonb),
  (v_project_id, 'Ramesh Patel', 'ramesh.patel@company.com', 'Fabricator', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id AND tag_number = ANY(ARRAY['V-101','V-301']))),
  (v_project_id, 'Suresh Kumar', 'suresh.kumar@company.com', 'Welder', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id AND tag_number = ANY(ARRAY['E-201','D-401']))),
  (v_project_id, 'Anil Deshmukh', 'anil.deshmukh@company.com', 'QC Inspector', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id)),
  (v_project_id, 'Kavita Rao', 'kavita.rao@company.com', 'Documentation Lead', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id AND tag_number = ANY(ARRAY['V-101','V-102','E-201','C-301','T-501','S-101'])));

  -- ========== 10. UPDATE PROJECT COUNTS ==========
  UPDATE public.projects SET equipment_count = 10, active_equipment = 10 WHERE id = v_project_id;

  -- ========== 11. SECOND PROJECT: IOCL Vadodara - Hydrotreater Vessels ==========
  INSERT INTO public.projects (
    name, client, location, manager, deadline, po_number, firm_id, created_by,
    project_manager_id, vdcr_manager_id, scope_of_work, status, sales_order_date,
    client_industry, client_focal_point, tpi_agency, vdcr_manager, consultant,
    kickoff_meeting_notes, special_production_notes, services_included,
    equipment_count, active_equipment, progress
  ) VALUES (
    'IOCL Vadodara - Hydrotreater Reactor & Separators',
    'Indian Oil Corporation Limited',
    'Vadodara Refinery, Gujarat',
    'Gaurav Singh',
    CURRENT_DATE + INTERVAL '18 months',
    'PO-IOCL-2024-3892',
    v_firm_id,
    v_user_id,
    v_user_id,
    v_user_id,
    'Supply of 6 pressure equipment items for hydrotreater unit: 1 reactor, 2 separators, 2 heat exchangers, 1 drum. ASME VIII Div.2 for reactor. Full VDCR cycle.',
    'active',
    CURRENT_DATE - INTERVAL '30 days',
    'Oil & Gas',
    'Suresh Iyer - Lead Engineer',
    'Bureau Veritas',
    'Arun Nair',
    'ABS - Design Review',
    '- Kickoff 30 days ago. Reactor design critical path. Client expects Rev-00 within 6 weeks.',
    '- SA-387 Gr.22 for reactor. Material lead 12 weeks.',
    '{"design": true, "testing": true, "documentation": true, "manufacturing": true}'::jsonb,
    6, 6, 12
  )
  RETURNING id INTO v_project_id_2;

  -- ========== 12. EQUIPMENT FOR PROJECT 2 (6 items) - FULL technical_sections & custom_fields like Project 1 ==========
  INSERT INTO public.equipment (
    project_id, type, tag_number, job_number, manufacturing_serial, name, size, material,
    design_code, status, progress, progress_phase, supervisor, welder, qc_inspector,
    project_manager, location, next_milestone, next_milestone_date, priority,
    custom_field_1_name, custom_field_1_value, custom_field_2_name, custom_field_2_value,
    custom_field_3_name, custom_field_3_value, custom_field_4_name, custom_field_4_value,
    custom_field_5_name, custom_field_5_value, custom_field_6_name, custom_field_6_value,
    custom_field_7_name, custom_field_7_value, custom_field_8_name, custom_field_8_value,
    notes, created_by, technical_sections, last_update
  ) VALUES
  (v_project_id_2, 'Reactor', 'R-501', 'JOB-IOCL-3892-01', 'Hydrotreater Reactor - 4 Catalyst Bed', 'Hydrotreater Reactor', '78" ID x 42'' T/T', 'SA-387 Gr.22 Cl.2', 'ASME VIII Div.2', 'documentation', 20, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Design', 'Design calc Rev-03 approval', CURRENT_DATE + INTERVAL '20 days', 'high',
   'Design Pressure', '520 psig', 'Design Temp', '900°F', 'MAWP', '572 psig', 'Catalyst Beds', '4', 'Corrosion Allowance', '3mm', 'Hydro Test', '780 psig', 'Operating Pressure', '420 psig', 'Lining', '347 SS clad',
   'Main hydrotreater reactor. 78" ID, 42'' T/T. 4 catalyst beds. SA-387 Gr.22 Cl.2 with 347 SS clad. ASME VIII Div.2 design. Long lead - material PO placed. Design calc Rev-03 under client review.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"80 inch"},{"name":"ID","value":"78 inch"},{"name":"Thickness","value":"42mm"},{"name":"Material","value":"SA-387 Gr.22 Cl.2"},{"name":"Cladding","value":"347 SS 3mm"},{"name":"Design Code","value":"ASME VIII Div.2"},{"name":"Corrosion Allowance","value":"3mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"},{"name":"Thickness","value":"46mm"},{"name":"Cladding","value":"347 SS 3mm"},{"name":"Material","value":"SA-387 Gr.22 Cl.2"}]},{"name":"Internals","customFields":[{"name":"Catalyst Beds","value":"4"},{"name":"Support Grid","value":"Inconel 600"},{"name":"Quench Ring","value":"Per P&ID"}]},{"name":"Nozzles","customFields":[{"name":"Feed Inlet","value":"8 inch"},{"name":"Product Outlet","value":"6 inch"},{"name":"Quench Inlets","value":"2x 4 inch"},{"name":"Instrument Connections","value":"Per P&ID"}]}]'::jsonb, CURRENT_DATE - 5),
  (v_project_id_2, 'Separator', 'V-501', 'JOB-IOCL-3892-02', 'HP Separator - 60 inch', 'HP Separator', '60" ID x 24'' T/T', 'SA-516 Gr.70', 'ASME VIII Div.1', 'in-progress', 45, 'fabrication', 'Vikram Sharma', 'Ramesh Patel', 'Anil Deshmukh', 'Gaurav Singh', 'Shop A', 'Shell weld NDT', CURRENT_DATE + INTERVAL '7 days', 'high',
   'Design Pressure', '320 psig', 'Design Temp', '800°F', 'MAWP', '350 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '480 psig', 'Operating Pressure', '280 psig', 'Retention Time', '6 min', 'Demister', 'Yes',
   'HP separator 60" ID, 24'' T/T. Demister pad. 4'' inlet, 2x 5'' liquid, 1x 6'' vapour. Shell rolling done. Longitudinal weld fit-up in progress. Critical path for hydrotreater unit.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"62 inch"},{"name":"ID","value":"60 inch"},{"name":"Thickness","value":"14.3mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Corrosion Allowance","value":"3mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"},{"name":"Thickness","value":"15.9mm"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"320 psig"},{"name":"Design Temp","value":"800°F"},{"name":"MAWP","value":"350 psig"},{"name":"Retention Time","value":"6 min"}]},{"name":"Internals","customFields":[{"name":"Demister","value":"Yes"},{"name":"Inlet","value":"4 inch"},{"name":"Liquid Outlets","value":"2x 5 inch"},{"name":"Vapour Outlet","value":"6 inch"}]}]'::jsonb, CURRENT_DATE - 2),
  (v_project_id_2, 'Separator', 'V-502', 'JOB-IOCL-3892-03', 'LP Separator - 48 inch', 'LP Separator', '48" ID x 18'' T/T', 'SA-516 Gr.70', 'ASME VIII Div.1', 'documentation', 30, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'Datasheet Rev-01 submission', CURRENT_DATE + INTERVAL '14 days', 'medium',
   'Design Pressure', '85 psig', 'Design Temp', '550°F', 'MAWP', '95 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '127 psig', 'Operating Pressure', '72 psig', 'Liquid Level', '50%', 'Retention Time', '5 min',
   'LP separator 48" ID, 18'' T/T. Demister pad. 3'' vapour, 2x 4'' liquid outlets. Datasheet Rev-01 submitted to client. Awaiting approval. GA drawing Rev-00 in progress.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"50 inch"},{"name":"ID","value":"48 inch"},{"name":"Thickness","value":"9.5mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Corrosion Allowance","value":"3mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"},{"name":"Thickness","value":"10.3mm"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"85 psig"},{"name":"Design Temp","value":"550°F"},{"name":"MAWP","value":"95 psig"}]},{"name":"Internals","customFields":[{"name":"Demister","value":"Yes"},{"name":"Retention Time","value":"5 min"}]}]'::jsonb, CURRENT_DATE - 8),
  (v_project_id_2, 'Heat Exchanger', 'E-501', 'JOB-IOCL-3892-04', 'Feed-Effluent Exchanger', 'Feed-Effluent Exchanger', '42" Shell x 24''', 'SA-516 Gr.70 / SA-213 T22', 'ASME VIII Div.1, TEMA B', 'pending', 10, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Pending', 'P&ID approval', CURRENT_DATE + INTERVAL '25 days', 'high',
   'Design Pressure Shell', '180 psig', 'Design Pressure Tube', '220 psig', 'Design Temp', '750°F', 'TEMA Class', 'BEM', 'Tube Count', '420', 'Baffle Cut', '25%', 'Hydro Test Shell', '270 psig', 'Hydro Test Tube', '330 psig',
   'Feed-effluent shell & tube exchanger. 42" shell, 420 tubes 3/4" OD. 2-pass tube side. BEM configuration. SA-213 T22 tubes for high temp. Awaiting P&ID Rev-05 approval. Material enquiry sent.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"44 inch"},{"name":"ID","value":"42 inch"},{"name":"Thickness","value":"12.7mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Design Pressure","value":"180 psig"},{"name":"Design Temp","value":"750°F"}]},{"name":"Tube Bundle","customFields":[{"name":"Tube OD","value":"3/4 inch"},{"name":"Tube Count","value":"420"},{"name":"Material","value":"SA-213 T22"},{"name":"Passes","value":"2"},{"name":"Design Pressure","value":"220 psig"}]},{"name":"Baffles","customFields":[{"name":"Type","value":"Single segmental"},{"name":"Cut","value":"25%"},{"name":"Spacing","value":"12 inch"}]},{"name":"TEMA","customFields":[{"name":"Class","value":"BEM"},{"name":"Front Head","value":"B"},{"name":"Shell","value":"E"},{"name":"Rear Head","value":"M"}]}]'::jsonb, CURRENT_DATE - 12),
  (v_project_id_2, 'Heat Exchanger', 'E-502', 'JOB-IOCL-3892-05', 'Air Cooler Exchanger', 'Air Cooler Exchanger', '36" Shell x 16''', 'SA-516 Gr.70 / SA-179', 'ASME VIII Div.1', 'pending', 5, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Pending', 'Datasheet Rev-00', CURRENT_DATE + INTERVAL '30 days', 'medium',
   'Design Pressure Shell', '95 psig', 'Design Pressure Tube', '120 psig', 'Design Temp', '450°F', 'TEMA Class', 'B', 'Tube Count', '256', 'Baffle Cut', '20%', 'Hydro Test Shell', '142 psig', 'Hydro Test Tube', '180 psig',
   'Air cooler exchanger 36" shell, 16'' T/T. 256 tubes. Aerial cooler type. SA-179 tubes. Early stage - datasheet Rev-00 in preparation. P&ID inputs awaited.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"38 inch"},{"name":"ID","value":"36 inch"},{"name":"Thickness","value":"9.5mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Design Pressure","value":"95 psig"},{"name":"Design Temp","value":"450°F"}]},{"name":"Tube Bundle","customFields":[{"name":"Tube OD","value":"3/4 inch"},{"name":"Tube Count","value":"256"},{"name":"Material","value":"SA-179"},{"name":"Type","value":"Aerial cooler"}]},{"name":"Baffles","customFields":[{"name":"Cut","value":"20%"},{"name":"Spacing","value":"10 inch"}]}]'::jsonb, CURRENT_DATE - 15),
  (v_project_id_2, 'Drum', 'D-501', 'JOB-IOCL-3892-06', 'Stripper Reflux Drum', 'Stripper Reflux Drum', '42" ID x 16'' T/T', 'SA-516 Gr.70', 'ASME VIII Div.1', 'documentation', 25, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'GA Rev-00 submission', CURRENT_DATE + INTERVAL '16 days', 'medium',
   'Design Pressure', '65 psig', 'Design Temp', '500°F', 'MAWP', '72 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '97 psig', 'Operating Pressure', '52 psig', 'Liquid Level', '55%', 'Status', 'Documentation',
   'Stripper reflux drum 42" ID, 16'' T/T. Horizontal. 2:1 SE heads. 3'' vapour, 2x 4'' liquid nozzles. GA Rev-00 in progress. Simple vessel - documentation phase.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"44 inch"},{"name":"ID","value":"42 inch"},{"name":"Thickness","value":"10.3mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Corrosion Allowance","value":"3mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"},{"name":"Thickness","value":"11.1mm"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"65 psig"},{"name":"Design Temp","value":"500°F"},{"name":"MAWP","value":"72 psig"}]}]'::jsonb, CURRENT_DATE - 6);

  -- ========== 13. EQUIPMENT TEAM POSITIONS FOR PROJECT 2 ==========
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_2
  LOOP
    INSERT INTO public.equipment_team_positions (equipment_id, position_name, person_name, email, phone, role) VALUES
    (v_equip_id, 'Project Manager', 'Gaurav Singh', 'gaurav.singh@company.com', '+91-98765-43200', 'editor'),
    (v_equip_id, 'VDCR Manager', 'Arun Nair', 'arun.nair@company.com', '+91-98765-43211', 'editor'),
    (v_equip_id, 'Supervisor', 'Vikram Sharma', 'vikram.sharma@company.com', '+91-98765-43212', 'editor'),
    (v_equip_id, 'Design Engineer', 'Priya Mehta', 'priya.mehta@company.com', '+91-98765-43210', 'editor'),
    (v_equip_id, 'Documentation Lead', 'Kavita Rao', 'kavita.rao@company.com', '+91-98765-43216', 'editor'),
    (v_equip_id, 'QC Inspector', 'Anil Deshmukh', 'anil.deshmukh@company.com', '+91-98765-43215', 'editor');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_2 AND tag_number = 'V-501'
  LOOP
    INSERT INTO public.equipment_team_positions (equipment_id, position_name, person_name, email, phone, role) VALUES
    (v_equip_id, 'Fabricator', 'Ramesh Patel', 'ramesh.patel@company.com', '+91-98765-43213', 'editor'),
    (v_equip_id, 'Welder', 'Suresh Kumar', 'suresh.kumar@company.com', '+91-98765-43214', 'editor');
  END LOOP;

  -- ========== 13b. EQUIPMENT PROGRESS & DOCUMENTS FOR PROJECT 2 (consistent with Project 1 level) ==========
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_2 AND tag_number = 'R-501'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'Design calc Rev-03 under client review. Comments on thickness.', 'update'),
    (v_equip_id, 'Material PO placed for SA-387 Gr.22. Lead 12 weeks.', 'update'),
    (v_equip_id, 'Datasheet Rev-00 in preparation. Awaiting design calc approval.', 'milestone'),
    (v_equip_id, 'Catalyst bed support design finalised. Inconel 600 spec approved.', 'update');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_2 AND tag_number = 'V-501'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'Shell rolling complete. Fit-up for longitudinal weld.', 'update'),
    (v_equip_id, 'Datasheet Rev-04 approved. Proceeding to fabrication.', 'milestone'),
    (v_equip_id, 'Shell plates received. MTR verified. Rolling in progress.', 'update');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_2 AND tag_number = 'V-502'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'Datasheet Rev-01 submitted to client. Awaiting approval.', 'milestone'),
    (v_equip_id, 'GA drawing Rev-00 in progress. Nozzle schedule finalised.', 'update');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_2 AND tag_number = 'E-501'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'P&ID Rev-05 under client review. Feed-effluent duty finalised.', 'update'),
    (v_equip_id, 'Material enquiry sent for SA-213 T22 tubes. Lead 10 weeks.', 'update'),
    (v_equip_id, 'Preliminary datasheet Rev-00 in preparation.', 'update');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_2 AND tag_number = 'E-502'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'P&ID under development. Air cooler duty awaited.', 'update'),
    (v_equip_id, 'Datasheet Rev-00 in preparation. Early stage.', 'update');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_2 AND tag_number = 'D-501'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'GA Rev-00 in progress. Nozzle schedule finalised.', 'update'),
    (v_equip_id, 'Datasheet Rev-00 approved. Proceeding to GA.', 'milestone');
  END LOOP;

  -- Project 2 equipment documents (full set per equipment like Project 1)
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_2 AND tag_number = 'R-501'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'R-501-Design-Calculation-Rev03', 'https://storage.example.com/docs/IOCL-R-501-Design-Calc.pdf', 'calculation'),
    (v_equip_id, 'R-501-Datasheet-Rev00', 'https://storage.example.com/docs/IOCL-R-501-Datasheet.pdf', 'datasheet'),
    (v_equip_id, 'R-501-Test-Procedure', 'https://storage.example.com/docs/IOCL-R-501-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'R-501-Hydro-Test-Procedure', 'https://storage.example.com/docs/IOCL-R-501-Hydro-Procedure.pdf', 'procedure'),
    (v_equip_id, 'R-501-Test-Certificate', 'https://storage.example.com/docs/IOCL-R-501-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'R-501-NDT-Certificate', 'https://storage.example.com/docs/IOCL-R-501-NDT-Cert.pdf', 'certificate'),
    (v_equip_id, 'R-501-MTR-Shell-Material', 'https://storage.example.com/docs/IOCL-R-501-MTR-Shell.pdf', 'mtr'),
    (v_equip_id, 'R-501-Material-Test-Certificate', 'https://storage.example.com/docs/IOCL-R-501-MTC.pdf', 'certificate'),
    (v_equip_id, 'R-501-Calibration-Certificate', 'https://storage.example.com/docs/IOCL-R-501-Calibration-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_2 AND tag_number = 'V-501'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'V-501-Datasheet-Rev04', 'https://storage.example.com/docs/IOCL-V-501-Datasheet-Rev04.pdf', 'datasheet'),
    (v_equip_id, 'V-501-General-Arrangement-Rev02', 'https://storage.example.com/docs/IOCL-V-501-GA-Rev02.pdf', 'drawing'),
    (v_equip_id, 'V-501-Fabrication-Drawing-Rev06', 'https://storage.example.com/docs/IOCL-V-501-Fab-Drawing-Rev06.pdf', 'drawing'),
    (v_equip_id, 'V-501-MTR-Shell', 'https://storage.example.com/docs/IOCL-V-501-MTR-Shell.pdf', 'mtr'),
    (v_equip_id, 'V-501-MTR-Heads', 'https://storage.example.com/docs/IOCL-V-501-MTR-Heads.pdf', 'mtr'),
    (v_equip_id, 'V-501-WPS-PQR', 'https://storage.example.com/docs/IOCL-V-501-WPS-PQR.pdf', 'wps'),
    (v_equip_id, 'V-501-Weld-Map', 'https://storage.example.com/docs/IOCL-V-501-Weld-Map.pdf', 'drawing'),
    (v_equip_id, 'V-501-Test-Procedure', 'https://storage.example.com/docs/IOCL-V-501-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'V-501-Hydro-Test-Certificate', 'https://storage.example.com/docs/IOCL-V-501-Hydro-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-501-Test-Certificate', 'https://storage.example.com/docs/IOCL-V-501-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-501-NDT-Report-RT', 'https://storage.example.com/docs/IOCL-V-501-NDT-RT.pdf', 'report'),
    (v_equip_id, 'V-501-NDT-Certificate', 'https://storage.example.com/docs/IOCL-V-501-NDT-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-501-Material-Test-Certificate', 'https://storage.example.com/docs/IOCL-V-501-MTC.pdf', 'certificate'),
    (v_equip_id, 'V-501-Calibration-Certificate', 'https://storage.example.com/docs/IOCL-V-501-Calibration-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_2 AND tag_number = 'V-502'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'V-502-Datasheet-Rev01', 'https://storage.example.com/docs/IOCL-V-502-Datasheet-Rev01.pdf', 'datasheet'),
    (v_equip_id, 'V-502-General-Arrangement-Rev00', 'https://storage.example.com/docs/IOCL-V-502-GA-Rev00.pdf', 'drawing'),
    (v_equip_id, 'V-502-Design-Calculation', 'https://storage.example.com/docs/IOCL-V-502-Design-Calc.pdf', 'calculation'),
    (v_equip_id, 'V-502-MTR-Shell', 'https://storage.example.com/docs/IOCL-V-502-MTR-Shell.pdf', 'mtr'),
    (v_equip_id, 'V-502-MTR-Heads', 'https://storage.example.com/docs/IOCL-V-502-MTR-Heads.pdf', 'mtr'),
    (v_equip_id, 'V-502-WPS-PQR', 'https://storage.example.com/docs/IOCL-V-502-WPS-PQR.pdf', 'wps'),
    (v_equip_id, 'V-502-Test-Procedure', 'https://storage.example.com/docs/IOCL-V-502-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'V-502-Test-Certificate', 'https://storage.example.com/docs/IOCL-V-502-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-502-Hydro-Test-Certificate', 'https://storage.example.com/docs/IOCL-V-502-Hydro-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-502-NDT-Certificate', 'https://storage.example.com/docs/IOCL-V-502-NDT-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-502-Material-Test-Certificate', 'https://storage.example.com/docs/IOCL-V-502-MTC.pdf', 'certificate'),
    (v_equip_id, 'V-502-Calibration-Certificate', 'https://storage.example.com/docs/IOCL-V-502-Calibration-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_2 AND tag_number = 'E-501'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'E-501-Datasheet-Rev00', 'https://storage.example.com/docs/IOCL-E-501-Datasheet-Rev00.pdf', 'datasheet'),
    (v_equip_id, 'E-501-Shell-Drawing', 'https://storage.example.com/docs/IOCL-E-501-Shell-Drawing.pdf', 'drawing'),
    (v_equip_id, 'E-501-Tube-Bundle-Drawing', 'https://storage.example.com/docs/IOCL-E-501-Tube-Bundle-Drawing.pdf', 'drawing'),
    (v_equip_id, 'E-501-MTR-Shell', 'https://storage.example.com/docs/IOCL-E-501-MTR-Shell.pdf', 'mtr'),
    (v_equip_id, 'E-501-MTR-Tubes', 'https://storage.example.com/docs/IOCL-E-501-MTR-Tubes.pdf', 'mtr'),
    (v_equip_id, 'E-501-Tube-Layout', 'https://storage.example.com/docs/IOCL-E-501-Tube-Layout.pdf', 'drawing'),
    (v_equip_id, 'E-501-Design-Calculation', 'https://storage.example.com/docs/IOCL-E-501-Design-Calc.pdf', 'calculation'),
    (v_equip_id, 'E-501-Test-Procedure', 'https://storage.example.com/docs/IOCL-E-501-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'E-501-Hydro-Test-Certificate', 'https://storage.example.com/docs/IOCL-E-501-Hydro-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'E-501-Test-Certificate', 'https://storage.example.com/docs/IOCL-E-501-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'E-501-Pressure-Test-Report', 'https://storage.example.com/docs/IOCL-E-501-Pressure-Test.pdf', 'report'),
    (v_equip_id, 'E-501-NDT-Certificate', 'https://storage.example.com/docs/IOCL-E-501-NDT-Cert.pdf', 'certificate'),
    (v_equip_id, 'E-501-Material-Test-Certificate', 'https://storage.example.com/docs/IOCL-E-501-MTC.pdf', 'certificate'),
    (v_equip_id, 'E-501-Calibration-Certificate', 'https://storage.example.com/docs/IOCL-E-501-Calibration-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_2 AND tag_number = 'E-502'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'E-502-Datasheet-Rev00', 'https://storage.example.com/docs/IOCL-E-502-Datasheet-Rev00.pdf', 'datasheet'),
    (v_equip_id, 'E-502-Shell-Drawing', 'https://storage.example.com/docs/IOCL-E-502-Shell-Drawing.pdf', 'drawing'),
    (v_equip_id, 'E-502-Tube-Bundle-Drawing', 'https://storage.example.com/docs/IOCL-E-502-Tube-Bundle-Drawing.pdf', 'drawing'),
    (v_equip_id, 'E-502-MTR-Shell', 'https://storage.example.com/docs/IOCL-E-502-MTR-Shell.pdf', 'mtr'),
    (v_equip_id, 'E-502-MTR-Tubes', 'https://storage.example.com/docs/IOCL-E-502-MTR-Tubes.pdf', 'mtr'),
    (v_equip_id, 'E-502-Test-Procedure', 'https://storage.example.com/docs/IOCL-E-502-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'E-502-Hydro-Test-Certificate', 'https://storage.example.com/docs/IOCL-E-502-Hydro-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'E-502-Test-Certificate', 'https://storage.example.com/docs/IOCL-E-502-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'E-502-Material-Test-Certificate', 'https://storage.example.com/docs/IOCL-E-502-MTC.pdf', 'certificate'),
    (v_equip_id, 'E-502-Calibration-Certificate', 'https://storage.example.com/docs/IOCL-E-502-Calibration-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_2 AND tag_number = 'D-501'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'D-501-Datasheet-Rev00', 'https://storage.example.com/docs/IOCL-D-501-Datasheet.pdf', 'datasheet'),
    (v_equip_id, 'D-501-GA-Rev02', 'https://storage.example.com/docs/IOCL-D-501-GA-Rev02.pdf', 'drawing'),
    (v_equip_id, 'D-501-Design-Calculation', 'https://storage.example.com/docs/IOCL-D-501-Design-Calc.pdf', 'calculation'),
    (v_equip_id, 'D-501-MTR-Package', 'https://storage.example.com/docs/IOCL-D-501-MTR-Package.pdf', 'mtr'),
    (v_equip_id, 'D-501-Test-Procedure', 'https://storage.example.com/docs/IOCL-D-501-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'D-501-Test-Certificate', 'https://storage.example.com/docs/IOCL-D-501-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'D-501-Hydro-Test-Certificate', 'https://storage.example.com/docs/IOCL-D-501-Hydro-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'D-501-NDT-Report', 'https://storage.example.com/docs/IOCL-D-501-NDT-Report.pdf', 'report'),
    (v_equip_id, 'D-501-Material-Test-Certificate', 'https://storage.example.com/docs/IOCL-D-501-MTC.pdf', 'certificate'),
    (v_equip_id, 'D-501-Calibration-Certificate', 'https://storage.example.com/docs/IOCL-D-501-Calibration-Cert.pdf', 'certificate');
  END LOOP;

  -- ========== 14. VDCR RECORDS FOR PROJECT 2 (7 entries) ==========
  INSERT INTO public.vdcr_records (project_id, firm_id, sr_no, equipment_tag_numbers, mfg_serial_numbers, job_numbers, client_doc_no, internal_doc_no, document_name, revision, code_status, status, department, remarks, project_documentation_start_date)
  VALUES
  (v_project_id_2, v_firm_id, '1', ARRAY['R-501'], ARRAY['Hydrotreater Reactor - 4 Catalyst Bed'], ARRAY['JOB-IOCL-3892-01'], 'IOCL-DOC-201', 'VDCR-3892-001', 'Design Calculation', 'Rev-03', 'Code 1', 'received-for-comment', 'Mechanical', 'Revise thickness per client.', CURRENT_DATE - INTERVAL '25 days'),
  (v_project_id_2, v_firm_id, '2', ARRAY['R-501'], ARRAY['Hydrotreater Reactor - 4 Catalyst Bed'], ARRAY['JOB-IOCL-3892-01'], 'IOCL-DOC-202', 'VDCR-3892-002', 'Datasheet', 'Rev-00', 'Code 1', 'pending', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '15 days'),
  (v_project_id_2, v_firm_id, '3', ARRAY['V-501'], ARRAY['HP Separator - 60 inch'], ARRAY['JOB-IOCL-3892-02'], 'IOCL-DOC-203', 'VDCR-3892-003', 'Datasheet', 'Rev-04', 'Code 1', 'approved', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '55 days'),
  (v_project_id_2, v_firm_id, '4', ARRAY['V-501'], ARRAY['HP Separator - 60 inch'], ARRAY['JOB-IOCL-3892-02'], 'IOCL-DOC-204', 'VDCR-3892-004', 'Fabrication Drawing', 'Rev-06', 'Code 1', 'sent-for-approval', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '65 days'),
  (v_project_id_2, v_firm_id, '5', ARRAY['V-502'], ARRAY['LP Separator - 48 inch'], ARRAY['JOB-IOCL-3892-03'], 'IOCL-DOC-205', 'VDCR-3892-005', 'Datasheet', 'Rev-01', 'Code 1', 'received-for-comment', 'Mechanical', 'Minor nozzle comments.', CURRENT_DATE - INTERVAL '12 days'),
  (v_project_id_2, v_firm_id, '6', ARRAY['D-501'], ARRAY['Stripper Reflux Drum'], ARRAY['JOB-IOCL-3892-06'], 'IOCL-DOC-206', 'VDCR-3892-006', 'General Arrangement', 'Rev-02', 'Code 2', 'approved', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '20 days'),
  (v_project_id_2, v_firm_id, '7', ARRAY['R-501','V-501','V-502'], ARRAY['Hydrotreater Reactor - 4 Catalyst Bed','HP Separator - 60 inch','LP Separator - 48 inch'], ARRAY['JOB-IOCL-3892-01','JOB-IOCL-3892-02','JOB-IOCL-3892-03'], 'IOCL-DOC-207', 'VDCR-3892-007', 'Project P&ID', 'Rev-08', 'Code 1', 'approved', 'Process', NULL, CURRENT_DATE - INTERVAL '40 days');

  -- ========== 15. VDCR REVISION EVENTS FOR PROJECT 2 (6-12 revisions per doc) ==========
  -- VDCR 1 (Design Calc Rev-03): 4 revisions
  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id_2 AND sr_no = '1'
  LOOP
    FOR v_i IN 0..3 LOOP
      INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
      VALUES
      (v_vdcr_id, 'submitted', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (25 - v_i * 5), CURRENT_TIMESTAMP - INTERVAL '1 day' * (20 - v_i * 5), NULL, NULL, CASE WHEN v_i = 0 THEN 'Design calc sent to client.' WHEN v_i < 3 THEN 'Rev-' || LPAD((v_i)::text, 2, '0') || ' sent per comments.' ELSE 'Rev-03 sent.' END, v_user_id),
      (v_vdcr_id, 'received', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (20 - v_i * 5), NULL, CURRENT_TIMESTAMP - INTERVAL '1 day' * (20 - v_i * 5), 5, CASE WHEN v_i < 3 THEN 'Received. Comments on thickness.' ELSE 'Received. Revise thickness per client.' END, v_user_id);
    END LOOP;
  END LOOP;
  -- VDCR 3 (V-501 Datasheet Rev-04): 5 revisions; VDCR 4 (Fab Drawing Rev-06): 7 revisions
  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id_2 AND sr_no = '3'
  LOOP
    FOR v_i IN 0..4 LOOP
      INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
      VALUES
      (v_vdcr_id, 'submitted', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (55 - v_i * 10), CURRENT_TIMESTAMP - INTERVAL '1 day' * (50 - v_i * 10), NULL, NULL, CASE WHEN v_i = 0 THEN 'Datasheet sent to client.' WHEN v_i < 4 THEN 'Rev-' || LPAD((v_i)::text, 2, '0') || ' sent.' ELSE 'Rev-04 sent.' END, v_user_id),
      (v_vdcr_id, 'received', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (50 - v_i * 10), NULL, CURRENT_TIMESTAMP - INTERVAL '1 day' * (50 - v_i * 10), 5, CASE WHEN v_i < 4 THEN 'Received. Comments. Resubmit.' ELSE 'Received. Approved Rev-04.' END, v_user_id);
    END LOOP;
  END LOOP;
  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id_2 AND sr_no = '4'
  LOOP
    FOR v_i IN 0..6 LOOP
      INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
      VALUES
      (v_vdcr_id, 'submitted', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (65 - v_i * 8), CURRENT_TIMESTAMP - INTERVAL '1 day' * (58 - v_i * 8), NULL, NULL, CASE WHEN v_i = 0 THEN 'Fab drawing sent to client.' WHEN v_i < 6 THEN 'Rev-' || LPAD((v_i)::text, 2, '0') || ' sent.' ELSE 'Rev-06 sent.' END, v_user_id),
      (v_vdcr_id, 'received', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (58 - v_i * 8), NULL, CURRENT_TIMESTAMP - INTERVAL '1 day' * (58 - v_i * 8), 7, CASE WHEN v_i < 6 THEN 'Received. Comments. Resubmit.' ELSE 'Received. Approved Rev-06.' END, v_user_id);
    END LOOP;
  END LOOP;
  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id_2 AND sr_no IN ('5','6','7')
  LOOP
    FOR v_i IN 0..5 LOOP
      INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
      VALUES
      (v_vdcr_id, 'submitted', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (30 - v_i * 4), CURRENT_TIMESTAMP - INTERVAL '1 day' * (26 - v_i * 4), NULL, NULL, CASE WHEN v_i = 0 THEN 'Document sent.' WHEN v_i < 5 THEN 'Rev-' || LPAD((v_i)::text, 2, '0') || ' sent.' ELSE 'Final sent.' END, v_user_id),
      (v_vdcr_id, 'received', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (26 - v_i * 4), NULL, CURRENT_TIMESTAMP - INTERVAL '1 day' * (26 - v_i * 4), 4, CASE WHEN v_i < 5 THEN 'Received. Resubmit.' ELSE 'Received. Approved.' END, v_user_id);
    END LOOP;
  END LOOP;
  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id_2 AND sr_no = '2'
  LOOP
    INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
    VALUES (v_vdcr_id, 'submitted', 'Rev-00', CURRENT_TIMESTAMP - INTERVAL '5 days', CURRENT_TIMESTAMP + INTERVAL '7 days', NULL, NULL, 'Datasheet Rev-00 in preparation. Awaiting design calc approval.', v_user_id);
  END LOOP;

  -- ========== 16. PROJECT MEMBERS FOR PROJECT 2 (with equipment_assignments) ==========
  INSERT INTO public.project_members (project_id, name, email, position, role, status, user_id, equipment_assignments)
  VALUES
  (v_project_id_2, 'Gaurav Singh', 'gaurav.singh@company.com', 'Project Manager', 'project_manager', 'active', v_user_id, '["All Equipment"]'::jsonb),
  (v_project_id_2, 'Vikram Sharma', 'vikram.sharma@company.com', 'Fabrication Supervisor', 'editor', 'active', v_user_id, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_2 AND tag_number = 'V-501')),
  (v_project_id_2, 'Priya Mehta', 'priya.mehta@company.com', 'Design Engineer', 'editor', 'active', v_user_id, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_2 AND tag_number = ANY(ARRAY['R-501','V-502','E-501','E-502','D-501']))),
  (v_project_id_2, 'Arun Nair', 'arun.nair@company.com', 'VDCR Manager', 'vdcr_manager', 'active', v_user_id, '["All Equipment"]'::jsonb),
  (v_project_id_2, 'Ramesh Patel', 'ramesh.patel@company.com', 'Fabricator', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_2 AND tag_number = 'V-501')),
  (v_project_id_2, 'Anil Deshmukh', 'anil.deshmukh@company.com', 'QC Inspector', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_2)),
  (v_project_id_2, 'Kavita Rao', 'kavita.rao@company.com', 'Documentation Lead', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_2));

  UPDATE public.projects SET equipment_count = 6, active_equipment = 6 WHERE id = v_project_id_2;

  -- ========== 17. PROJECT 3: BPCL Kochi - FCCU Vessels ==========
  INSERT INTO public.projects (
    name, client, location, manager, deadline, po_number, firm_id, created_by,
    project_manager_id, vdcr_manager_id, scope_of_work, status, sales_order_date,
    client_industry, client_focal_point, tpi_agency, vdcr_manager, consultant,
    kickoff_meeting_notes, special_production_notes, services_included,
    equipment_count, active_equipment, progress
  ) VALUES (
    'BPCL Kochi - FCCU Regenerator & Stripper',
    'Bharat Petroleum Corporation Limited',
    'Kochi Refinery, Kerala',
    'Gaurav Singh',
    CURRENT_DATE + INTERVAL '16 months',
    'PO-BPCL-2024-4521',
    v_firm_id,
    v_user_id,
    v_user_id,
    v_user_id,
    'Supply of 8 pressure equipment items for FCCU revamp: regenerator, stripper, 2 cyclones, 2 heat exchangers, 1 drum, 1 air blower skid. ASME VIII Div.1. Full VDCR cycle.',
    'active',
    CURRENT_DATE - INTERVAL '20 days',
    'Oil & Gas',
    'Manoj Pillai - Lead Engineer',
    'Lloyd''s Register',
    'Arun Nair',
    'TÜV SÜD - Design Review',
    '- Kickoff 20 days ago. Regenerator critical path. Client expects first submissions within 6 weeks.',
    '- SA-516 Gr.70 for regenerator. 347 clad for stripper. Material lead 8 weeks.',
    '{"design": true, "testing": true, "documentation": true, "manufacturing": true}'::jsonb,
    8, 8, 10
  )
  RETURNING id INTO v_project_id_3;

  -- ========== 18. EQUIPMENT FOR PROJECT 3 (8 items) - FULL detail like Project 1 ==========
  INSERT INTO public.equipment (
    project_id, type, tag_number, job_number, manufacturing_serial, name, size, material,
    design_code, status, progress, progress_phase, supervisor, welder, qc_inspector,
    project_manager, location, next_milestone, next_milestone_date, priority,
    custom_field_1_name, custom_field_1_value, custom_field_2_name, custom_field_2_value,
    custom_field_3_name, custom_field_3_value, custom_field_4_name, custom_field_4_value,
    custom_field_5_name, custom_field_5_value, custom_field_6_name, custom_field_6_value,
    custom_field_7_name, custom_field_7_value, custom_field_8_name, custom_field_8_value,
    notes, created_by, technical_sections, last_update
  ) VALUES
  (v_project_id_3, 'Reactor', 'R-601', 'JOB-BPCL-4521-01', 'FCCU Regenerator - 18m Dia', 'FCCU Regenerator', '216" ID x 65'' T/T', 'SA-516 Gr.70 + 6mm 347 clad', 'ASME VIII Div.1', 'documentation', 15, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Design', 'Design calc Rev-02 approval', CURRENT_DATE + INTERVAL '22 days', 'high',
   'Design Pressure', '35 psig', 'Design Temp', '1650°F', 'MAWP', '40 psig', 'Corrosion Allowance', '6mm', 'Hydro Test', '52 psig', 'Operating Pressure', '28 psig', 'Cyclones', '2', 'Lining', '347 SS 6mm clad',
   'FCCU regenerator 216" ID, 65'' T/T. 2 cyclones. SA-516 Gr.70 + 6mm 347 clad. ASME VIII Div.1. Critical path - design calc Rev-02 under client review. Material enquiry sent for SA-516 Gr.70. Lead 8 weeks.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"218 inch"},{"name":"ID","value":"216 inch"},{"name":"Thickness","value":"25mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Cladding","value":"347 SS 6mm"},{"name":"Design Code","value":"ASME VIII Div.1"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"},{"name":"Thickness","value":"28mm"},{"name":"Cladding","value":"347 SS 6mm"}]},{"name":"Internals","customFields":[{"name":"Cyclones","value":"2"},{"name":"Air Grid","value":"Inconel 600"}]}]'::jsonb, CURRENT_DATE - 4),
  (v_project_id_3, 'Reactor', 'R-602', 'JOB-BPCL-4521-02', 'FCCU Stripper - 12m Dia', 'FCCU Stripper', '144" ID x 45'' T/T', 'SA-516 Gr.70 + 6mm 347 clad', 'ASME VIII Div.1', 'documentation', 12, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Design', 'Datasheet Rev-00 submission', CURRENT_DATE + INTERVAL '28 days', 'high',
   'Design Pressure', '45 psig', 'Design Temp', '1050°F', 'MAWP', '52 psig', 'Corrosion Allowance', '6mm', 'Hydro Test', '68 psig', 'Operating Pressure', '38 psig', 'Stages', '12', 'Steam Rings', '4',
   'FCCU stripper 144" ID, 45'' T/T. 12 stages, 4 steam rings. SA-516 Gr.70 + 6mm 347 clad. Datasheet Rev-00 in preparation. Awaiting design inputs from regenerator calc.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"146 inch"},{"name":"ID","value":"144 inch"},{"name":"Thickness","value":"22mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Cladding","value":"347 SS 6mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"},{"name":"Thickness","value":"24mm"}]},{"name":"Internals","customFields":[{"name":"Stages","value":"12"},{"name":"Steam Rings","value":"4"}]}]'::jsonb, CURRENT_DATE - 6),
  (v_project_id_3, 'Separator', 'V-601', 'JOB-BPCL-4521-03', 'Primary Cyclone - 48 inch', 'Primary Cyclone', '48" ID x 18'' T/T', 'SA-240 321', 'ASME VIII Div.1', 'in-progress', 38, 'fabrication', 'Vikram Sharma', 'Ramesh Patel', 'Anil Deshmukh', 'Gaurav Singh', 'Shop B', 'Shell weld NDT', CURRENT_DATE + INTERVAL '9 days', 'high',
   'Design Pressure', '28 psig', 'Design Temp', '1400°F', 'MAWP', '32 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '42 psig', 'Operating Pressure', '22 psig', 'Inlet', '24 inch', 'Outlet', '18 inch',
   'Primary cyclone 48" ID, 18'' T/T. SA-240 321. 24" inlet, 18" outlet. Shell rolling done. Longitudinal weld fit-up in progress. Critical for FCCU unit.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"50 inch"},{"name":"ID","value":"48 inch"},{"name":"Thickness","value":"9.5mm"},{"name":"Material","value":"SA-240 321"},{"name":"Corrosion Allowance","value":"3mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"},{"name":"Thickness","value":"10.3mm"}]},{"name":"Nozzles","customFields":[{"name":"Inlet","value":"24 inch"},{"name":"Outlet","value":"18 inch"}]}]'::jsonb, CURRENT_DATE - 3),
  (v_project_id_3, 'Separator', 'V-602', 'JOB-BPCL-4521-04', 'Secondary Cyclone - 36 inch', 'Secondary Cyclone', '36" ID x 14'' T/T', 'SA-240 321', 'ASME VIII Div.1', 'documentation', 28, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'Datasheet Rev-01 approval', CURRENT_DATE + INTERVAL '16 days', 'medium',
   'Design Pressure', '28 psig', 'Design Temp', '1400°F', 'MAWP', '32 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '42 psig', 'Operating Pressure', '22 psig', 'Inlet', '18 inch', 'Outlet', '14 inch',
   'Secondary cyclone 36" ID, 14'' T/T. SA-240 321. 18" inlet, 14" outlet. Datasheet Rev-01 under client review. GA drawing in progress.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"38 inch"},{"name":"ID","value":"36 inch"},{"name":"Thickness","value":"8mm"},{"name":"Material","value":"SA-240 321"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"},{"name":"Thickness","value":"8.6mm"}]},{"name":"Nozzles","customFields":[{"name":"Inlet","value":"18 inch"},{"name":"Outlet","value":"14 inch"}]}]'::jsonb, CURRENT_DATE - 7),
  (v_project_id_3, 'Heat Exchanger', 'E-601', 'JOB-BPCL-4521-05', 'Regenerator Flue Gas Cooler', 'Regenerator Flue Gas Cooler', '60" Shell x 32''', 'SA-516 Gr.70 / SA-213 T11', 'ASME VIII Div.1, TEMA B', 'pending', 8, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Pending', 'P&ID Rev-05 approval', CURRENT_DATE + INTERVAL '32 days', 'high',
   'Design Pressure Shell', '55 psig', 'Design Pressure Tube', '85 psig', 'Design Temp', '1200°F', 'TEMA Class', 'BEM', 'Tube Count', '520', 'Baffle Cut', '25%', 'Hydro Test Shell', '82 psig', 'Hydro Test Tube', '127 psig',
   'Regenerator flue gas cooler. 60" shell, 520 tubes 1" OD. SA-213 T11 for high temp. BEM configuration. Awaiting P&ID Rev-05 approval. Material enquiry sent.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"62 inch"},{"name":"ID","value":"60 inch"},{"name":"Thickness","value":"14.3mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Design Pressure","value":"55 psig"},{"name":"Design Temp","value":"1200°F"}]},{"name":"Tube Bundle","customFields":[{"name":"Tube OD","value":"1 inch"},{"name":"Tube Count","value":"520"},{"name":"Material","value":"SA-213 T11"},{"name":"Passes","value":"2"},{"name":"Design Pressure","value":"85 psig"}]},{"name":"Baffles","customFields":[{"name":"Type","value":"Single segmental"},{"name":"Cut","value":"25%"},{"name":"Spacing","value":"16 inch"}]},{"name":"TEMA","customFields":[{"name":"Class","value":"BEM"},{"name":"Front Head","value":"B"},{"name":"Shell","value":"E"},{"name":"Rear Head","value":"M"}]}]'::jsonb, CURRENT_DATE - 10),
  (v_project_id_3, 'Heat Exchanger', 'E-602', 'JOB-BPCL-4521-06', 'Stripper Steam Superheater', 'Stripper Steam Superheater', '42" Shell x 24''', 'SA-516 Gr.70 / SA-213 T22', 'ASME VIII Div.1, TEMA B', 'pending', 5, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Pending', 'Datasheet Rev-00', CURRENT_DATE + INTERVAL '35 days', 'medium',
   'Design Pressure Shell', '120 psig', 'Design Pressure Tube', '180 psig', 'Design Temp', '950°F', 'TEMA Class', 'BEM', 'Tube Count', '380', 'Baffle Cut', '20%', 'Hydro Test Shell', '180 psig', 'Hydro Test Tube', '270 psig',
   'Stripper steam superheater. 42" shell, 380 tubes 1" OD. SA-213 T22. BEM configuration. Early stage - datasheet Rev-00 in preparation. P&ID inputs awaited.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"44 inch"},{"name":"ID","value":"42 inch"},{"name":"Thickness","value":"12.7mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Design Pressure","value":"120 psig"},{"name":"Design Temp","value":"950°F"}]},{"name":"Tube Bundle","customFields":[{"name":"Tube OD","value":"1 inch"},{"name":"Tube Count","value":"380"},{"name":"Material","value":"SA-213 T22"},{"name":"Passes","value":"2"}]},{"name":"Baffles","customFields":[{"name":"Cut","value":"20%"},{"name":"Spacing","value":"12 inch"}]}]'::jsonb, CURRENT_DATE - 12),
  (v_project_id_3, 'Drum', 'D-601', 'JOB-BPCL-4521-07', 'FCCU Reflux Drum', 'FCCU Reflux Drum', '48" ID x 20'' T/T', 'SA-516 Gr.70', 'ASME VIII Div.1', 'documentation', 22, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'GA Rev-01 submission', CURRENT_DATE + INTERVAL '18 days', 'medium',
   'Design Pressure', '75 psig', 'Design Temp', '550°F', 'MAWP', '82 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '112 psig', 'Operating Pressure', '58 psig', 'Liquid Level', '55%', 'Status', 'Documentation',
   'FCCU reflux drum 48" ID, 20'' T/T. Horizontal. 2:1 SE heads. 4'' vapour, 2x 5'' liquid nozzles. GA Rev-01 in progress. Simple vessel - documentation phase.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"50 inch"},{"name":"ID","value":"48 inch"},{"name":"Thickness","value":"10.3mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Corrosion Allowance","value":"3mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"},{"name":"Thickness","value":"11.1mm"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"75 psig"},{"name":"Design Temp","value":"550°F"},{"name":"MAWP","value":"82 psig"}]}]'::jsonb, CURRENT_DATE - 8),
  (v_project_id_3, 'Skid', 'S-601', 'JOB-BPCL-4521-08', 'FCCU Air Blower Skid', 'FCCU Air Blower Skid', '16'' x 10'' x 8'' base', 'CS base, SS316 blower', 'ASME B31.3', 'pending', 3, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Pending', 'P&ID & GA approval', CURRENT_DATE + INTERVAL '40 days', 'low',
   'Design Pressure', '55 psig', 'Design Temp', '450°F', 'Blower Type', 'Centrifugal', 'Material', 'SS316', 'Base', 'Carbon steel', 'Piping', 'B31.3', 'Hydro Test', '82 psig', 'Status', 'Design',
   'FCCU air blower skid. SS316 centrifugal blower. Carbon steel base 16'' x 10'' x 8''. Piping per B31.3. Awaiting P&ID & GA approval. Pump datasheet received.', v_user_id,
   '[{"name":"Blower","customFields":[{"name":"Type","value":"Centrifugal"},{"name":"Material","value":"SS316"},{"name":"Design Pressure","value":"55 psig"},{"name":"Design Temp","value":"450°F"}]},{"name":"Skid Base","customFields":[{"name":"Material","value":"Carbon steel"},{"name":"Dimensions","value":"16'' x 10'' x 8''"},{"name":"Piping Code","value":"B31.3"}]}]'::jsonb, CURRENT_DATE - 14);

  -- ========== 19. EQUIPMENT TEAM POSITIONS, PROGRESS, DOCUMENTS FOR PROJECT 3 ==========
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_3
  LOOP
    INSERT INTO public.equipment_team_positions (equipment_id, position_name, person_name, email, phone, role) VALUES
    (v_equip_id, 'Project Manager', 'Gaurav Singh', 'gaurav.singh@company.com', '+91-98765-43200', 'editor'),
    (v_equip_id, 'VDCR Manager', 'Arun Nair', 'arun.nair@company.com', '+91-98765-43211', 'editor'),
    (v_equip_id, 'Supervisor', 'Vikram Sharma', 'vikram.sharma@company.com', '+91-98765-43212', 'editor'),
    (v_equip_id, 'Design Engineer', 'Priya Mehta', 'priya.mehta@company.com', '+91-98765-43210', 'editor'),
    (v_equip_id, 'Documentation Lead', 'Kavita Rao', 'kavita.rao@company.com', '+91-98765-43216', 'editor'),
    (v_equip_id, 'QC Inspector', 'Anil Deshmukh', 'anil.deshmukh@company.com', '+91-98765-43215', 'editor');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_3 AND tag_number = 'V-601'
  LOOP
    INSERT INTO public.equipment_team_positions (equipment_id, position_name, person_name, email, phone, role) VALUES
    (v_equip_id, 'Fabricator', 'Ramesh Patel', 'ramesh.patel@company.com', '+91-98765-43213', 'editor'),
    (v_equip_id, 'Welder', 'Suresh Kumar', 'suresh.kumar@company.com', '+91-98765-43214', 'editor');
  END LOOP;

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_3 AND tag_number = 'R-601'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'Design calc Rev-02 under client review. Comments on cyclone inlet.', 'update'),
    (v_equip_id, 'Material enquiry sent for SA-516 Gr.70. Lead 8 weeks.', 'update'),
    (v_equip_id, 'Cyclone support design finalised. Inconel 600 spec approved.', 'update');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_3 AND tag_number = 'R-602'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'Datasheet Rev-00 in preparation. Awaiting regenerator design inputs.', 'update'),
    (v_equip_id, 'Steam ring layout under review. 12 stages confirmed.', 'update');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_3 AND tag_number = 'V-602'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'Datasheet Rev-01 submitted to client. Awaiting approval.', 'milestone'),
    (v_equip_id, 'GA drawing Rev-00 in progress. Nozzle schedule finalised.', 'update');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_3 AND tag_number = 'D-601'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'GA Rev-01 in progress. Nozzle schedule finalised.', 'update'),
    (v_equip_id, 'Datasheet Rev-00 approved. Proceeding to GA.', 'milestone');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_3 AND tag_number = 'V-601'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'Shell rolling complete. Fit-up for longitudinal weld.', 'update'),
    (v_equip_id, 'Datasheet Rev-02 approved. Proceeding to fabrication.', 'milestone'),
    (v_equip_id, 'SA-240 321 plates received. MTR verified. Rolling in progress.', 'update');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_3 AND tag_number = 'E-601'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'P&ID Rev-05 under client review. Flue gas duty finalised.', 'update'),
    (v_equip_id, 'Material enquiry sent for SA-213 T11 tubes. Lead 10 weeks.', 'update'),
    (v_equip_id, 'Preliminary datasheet Rev-00 in preparation.', 'update');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_3 AND tag_number = 'E-602'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'P&ID under development. Steam superheater duty awaited.', 'update'),
    (v_equip_id, 'Datasheet Rev-00 in preparation. Early stage.', 'update');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_3 AND tag_number = 'S-601'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'P&ID & GA under development. Blower datasheet received.', 'update'),
    (v_equip_id, 'Awaiting client approval for skid layout.', 'update');
  END LOOP;

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_3 AND tag_number = 'R-601'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'R-601-Design-Calculation-Rev02', 'https://storage.example.com/docs/BPCL-R-601-Design-Calc.pdf', 'calculation'),
    (v_equip_id, 'R-601-Datasheet-Rev00', 'https://storage.example.com/docs/BPCL-R-601-Datasheet.pdf', 'datasheet'),
    (v_equip_id, 'R-601-Test-Procedure', 'https://storage.example.com/docs/BPCL-R-601-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'R-601-Hydro-Test-Procedure', 'https://storage.example.com/docs/BPCL-R-601-Hydro-Procedure.pdf', 'procedure'),
    (v_equip_id, 'R-601-Test-Certificate', 'https://storage.example.com/docs/BPCL-R-601-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'R-601-NDT-Certificate', 'https://storage.example.com/docs/BPCL-R-601-NDT-Cert.pdf', 'certificate'),
    (v_equip_id, 'R-601-MTR-Shell-Material', 'https://storage.example.com/docs/BPCL-R-601-MTR-Shell.pdf', 'mtr'),
    (v_equip_id, 'R-601-Material-Test-Certificate', 'https://storage.example.com/docs/BPCL-R-601-MTC.pdf', 'certificate'),
    (v_equip_id, 'R-601-Calibration-Certificate', 'https://storage.example.com/docs/BPCL-R-601-Calibration-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_3 AND tag_number = 'R-602'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'R-602-Design-Calculation-Rev01', 'https://storage.example.com/docs/BPCL-R-602-Design-Calc.pdf', 'calculation'),
    (v_equip_id, 'R-602-Datasheet-Rev00', 'https://storage.example.com/docs/BPCL-R-602-Datasheet.pdf', 'datasheet'),
    (v_equip_id, 'R-602-Test-Procedure', 'https://storage.example.com/docs/BPCL-R-602-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'R-602-Test-Certificate', 'https://storage.example.com/docs/BPCL-R-602-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'R-602-NDT-Certificate', 'https://storage.example.com/docs/BPCL-R-602-NDT-Cert.pdf', 'certificate'),
    (v_equip_id, 'R-602-Material-Test-Certificate', 'https://storage.example.com/docs/BPCL-R-602-MTC.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_3 AND tag_number = 'V-601'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'V-601-Datasheet-Rev02', 'https://storage.example.com/docs/BPCL-V-601-Datasheet-Rev02.pdf', 'datasheet'),
    (v_equip_id, 'V-601-General-Arrangement-Rev01', 'https://storage.example.com/docs/BPCL-V-601-GA-Rev01.pdf', 'drawing'),
    (v_equip_id, 'V-601-Fabrication-Drawing-Rev04', 'https://storage.example.com/docs/BPCL-V-601-Fab-Drawing-Rev04.pdf', 'drawing'),
    (v_equip_id, 'V-601-MTR-Shell', 'https://storage.example.com/docs/BPCL-V-601-MTR-Shell.pdf', 'mtr'),
    (v_equip_id, 'V-601-MTR-Heads', 'https://storage.example.com/docs/BPCL-V-601-MTR-Heads.pdf', 'mtr'),
    (v_equip_id, 'V-601-WPS-PQR', 'https://storage.example.com/docs/BPCL-V-601-WPS-PQR.pdf', 'wps'),
    (v_equip_id, 'V-601-Weld-Map', 'https://storage.example.com/docs/BPCL-V-601-Weld-Map.pdf', 'drawing'),
    (v_equip_id, 'V-601-Test-Procedure', 'https://storage.example.com/docs/BPCL-V-601-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'V-601-Hydro-Test-Certificate', 'https://storage.example.com/docs/BPCL-V-601-Hydro-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-601-Test-Certificate', 'https://storage.example.com/docs/BPCL-V-601-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-601-NDT-Report-RT', 'https://storage.example.com/docs/BPCL-V-601-NDT-RT.pdf', 'report'),
    (v_equip_id, 'V-601-NDT-Certificate', 'https://storage.example.com/docs/BPCL-V-601-NDT-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-601-Material-Test-Certificate', 'https://storage.example.com/docs/BPCL-V-601-MTC.pdf', 'certificate'),
    (v_equip_id, 'V-601-Calibration-Certificate', 'https://storage.example.com/docs/BPCL-V-601-Calibration-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_3 AND tag_number = 'V-602'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'V-602-Datasheet-Rev01', 'https://storage.example.com/docs/BPCL-V-602-Datasheet-Rev01.pdf', 'datasheet'),
    (v_equip_id, 'V-602-General-Arrangement-Rev00', 'https://storage.example.com/docs/BPCL-V-602-GA-Rev00.pdf', 'drawing'),
    (v_equip_id, 'V-602-Design-Calculation', 'https://storage.example.com/docs/BPCL-V-602-Design-Calc.pdf', 'calculation'),
    (v_equip_id, 'V-602-MTR-Shell', 'https://storage.example.com/docs/BPCL-V-602-MTR-Shell.pdf', 'mtr'),
    (v_equip_id, 'V-602-Test-Procedure', 'https://storage.example.com/docs/BPCL-V-602-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'V-602-Test-Certificate', 'https://storage.example.com/docs/BPCL-V-602-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-602-Hydro-Test-Certificate', 'https://storage.example.com/docs/BPCL-V-602-Hydro-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-602-NDT-Certificate', 'https://storage.example.com/docs/BPCL-V-602-NDT-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-602-Material-Test-Certificate', 'https://storage.example.com/docs/BPCL-V-602-MTC.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_3 AND tag_number = 'E-601'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'E-601-Datasheet-Rev00', 'https://storage.example.com/docs/BPCL-E-601-Datasheet-Rev00.pdf', 'datasheet'),
    (v_equip_id, 'E-601-Shell-Drawing', 'https://storage.example.com/docs/BPCL-E-601-Shell-Drawing.pdf', 'drawing'),
    (v_equip_id, 'E-601-Tube-Bundle-Drawing', 'https://storage.example.com/docs/BPCL-E-601-Tube-Bundle-Drawing.pdf', 'drawing'),
    (v_equip_id, 'E-601-MTR-Shell', 'https://storage.example.com/docs/BPCL-E-601-MTR-Shell.pdf', 'mtr'),
    (v_equip_id, 'E-601-MTR-Tubes', 'https://storage.example.com/docs/BPCL-E-601-MTR-Tubes.pdf', 'mtr'),
    (v_equip_id, 'E-601-Tube-Layout', 'https://storage.example.com/docs/BPCL-E-601-Tube-Layout.pdf', 'drawing'),
    (v_equip_id, 'E-601-Design-Calculation', 'https://storage.example.com/docs/BPCL-E-601-Design-Calc.pdf', 'calculation'),
    (v_equip_id, 'E-601-Test-Procedure', 'https://storage.example.com/docs/BPCL-E-601-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'E-601-Hydro-Test-Certificate', 'https://storage.example.com/docs/BPCL-E-601-Hydro-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'E-601-Test-Certificate', 'https://storage.example.com/docs/BPCL-E-601-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'E-601-NDT-Certificate', 'https://storage.example.com/docs/BPCL-E-601-NDT-Cert.pdf', 'certificate'),
    (v_equip_id, 'E-601-Material-Test-Certificate', 'https://storage.example.com/docs/BPCL-E-601-MTC.pdf', 'certificate'),
    (v_equip_id, 'E-601-Calibration-Certificate', 'https://storage.example.com/docs/BPCL-E-601-Calibration-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_3 AND tag_number = 'E-602'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'E-602-Datasheet-Rev00', 'https://storage.example.com/docs/BPCL-E-602-Datasheet-Rev00.pdf', 'datasheet'),
    (v_equip_id, 'E-602-Shell-Drawing', 'https://storage.example.com/docs/BPCL-E-602-Shell-Drawing.pdf', 'drawing'),
    (v_equip_id, 'E-602-Tube-Bundle-Drawing', 'https://storage.example.com/docs/BPCL-E-602-Tube-Bundle-Drawing.pdf', 'drawing'),
    (v_equip_id, 'E-602-MTR-Shell', 'https://storage.example.com/docs/BPCL-E-602-MTR-Shell.pdf', 'mtr'),
    (v_equip_id, 'E-602-MTR-Tubes', 'https://storage.example.com/docs/BPCL-E-602-MTR-Tubes.pdf', 'mtr'),
    (v_equip_id, 'E-602-Test-Procedure', 'https://storage.example.com/docs/BPCL-E-602-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'E-602-Hydro-Test-Certificate', 'https://storage.example.com/docs/BPCL-E-602-Hydro-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'E-602-Test-Certificate', 'https://storage.example.com/docs/BPCL-E-602-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'E-602-Material-Test-Certificate', 'https://storage.example.com/docs/BPCL-E-602-MTC.pdf', 'certificate'),
    (v_equip_id, 'E-602-Calibration-Certificate', 'https://storage.example.com/docs/BPCL-E-602-Calibration-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_3 AND tag_number = 'D-601'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'D-601-Datasheet-Rev00', 'https://storage.example.com/docs/BPCL-D-601-Datasheet.pdf', 'datasheet'),
    (v_equip_id, 'D-601-GA-Rev01', 'https://storage.example.com/docs/BPCL-D-601-GA-Rev01.pdf', 'drawing'),
    (v_equip_id, 'D-601-Design-Calculation', 'https://storage.example.com/docs/BPCL-D-601-Design-Calc.pdf', 'calculation'),
    (v_equip_id, 'D-601-MTR-Package', 'https://storage.example.com/docs/BPCL-D-601-MTR-Package.pdf', 'mtr'),
    (v_equip_id, 'D-601-Test-Procedure', 'https://storage.example.com/docs/BPCL-D-601-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'D-601-Test-Certificate', 'https://storage.example.com/docs/BPCL-D-601-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'D-601-Hydro-Test-Certificate', 'https://storage.example.com/docs/BPCL-D-601-Hydro-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'D-601-NDT-Report', 'https://storage.example.com/docs/BPCL-D-601-NDT-Report.pdf', 'report'),
    (v_equip_id, 'D-601-Material-Test-Certificate', 'https://storage.example.com/docs/BPCL-D-601-MTC.pdf', 'certificate'),
    (v_equip_id, 'D-601-Calibration-Certificate', 'https://storage.example.com/docs/BPCL-D-601-Calibration-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_3 AND tag_number = 'S-601'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'S-601-PID-Rev00', 'https://storage.example.com/docs/BPCL-S-601-PID.pdf', 'drawing'),
    (v_equip_id, 'S-601-Blower-Datasheet', 'https://storage.example.com/docs/BPCL-S-601-Blower-Datasheet.pdf', 'datasheet'),
    (v_equip_id, 'S-601-GA-Rev00', 'https://storage.example.com/docs/BPCL-S-601-GA.pdf', 'drawing'),
    (v_equip_id, 'S-601-Blower-Calibration-Certificate', 'https://storage.example.com/docs/BPCL-S-601-Calibration-Cert.pdf', 'certificate'),
    (v_equip_id, 'S-601-Test-Procedure', 'https://storage.example.com/docs/BPCL-S-601-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'S-601-Test-Certificate', 'https://storage.example.com/docs/BPCL-S-601-Test-Cert.pdf', 'certificate');
  END LOOP;

  -- ========== 20. VDCR RECORDS & EVENTS FOR PROJECT 3 ==========
  INSERT INTO public.vdcr_records (project_id, firm_id, sr_no, equipment_tag_numbers, mfg_serial_numbers, job_numbers, client_doc_no, internal_doc_no, document_name, revision, code_status, status, department, remarks, project_documentation_start_date)
  VALUES
  (v_project_id_3, v_firm_id, '1', ARRAY['R-601'], ARRAY['FCCU Regenerator - 18m Dia'], ARRAY['JOB-BPCL-4521-01'], 'BPCL-DOC-301', 'VDCR-4521-001', 'Design Calculation', 'Rev-02', 'Code 1', 'received-for-comment', 'Mechanical', 'Revise cyclone inlet per client.', CURRENT_DATE - INTERVAL '18 days'),
  (v_project_id_3, v_firm_id, '2', ARRAY['V-601'], ARRAY['Primary Cyclone - 48 inch'], ARRAY['JOB-BPCL-4521-03'], 'BPCL-DOC-302', 'VDCR-4521-002', 'Datasheet', 'Rev-02', 'Code 1', 'approved', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '45 days'),
  (v_project_id_3, v_firm_id, '3', ARRAY['V-601'], ARRAY['Primary Cyclone - 48 inch'], ARRAY['JOB-BPCL-4521-03'], 'BPCL-DOC-303', 'VDCR-4521-003', 'Fabrication Drawing', 'Rev-04', 'Code 1', 'sent-for-approval', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '55 days'),
  (v_project_id_3, v_firm_id, '4', ARRAY['R-601','R-602','V-601','V-602'], ARRAY['FCCU Regenerator - 18m Dia','FCCU Stripper - 12m Dia','Primary Cyclone - 48 inch','Secondary Cyclone - 36 inch'], ARRAY['JOB-BPCL-4521-01','JOB-BPCL-4521-02','JOB-BPCL-4521-03','JOB-BPCL-4521-04'], 'BPCL-DOC-304', 'VDCR-4521-004', 'Project P&ID', 'Rev-06', 'Code 1', 'approved', 'Process', NULL, CURRENT_DATE - INTERVAL '35 days');

  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id_3 AND sr_no = '1'
  LOOP
    FOR v_i IN 0..4 LOOP
      INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
      VALUES
      (v_vdcr_id, 'submitted', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (18 - v_i * 3), CURRENT_TIMESTAMP - INTERVAL '1 day' * (15 - v_i * 3), NULL, NULL, CASE WHEN v_i = 0 THEN 'Design calc sent to client.' WHEN v_i < 4 THEN 'Rev-' || LPAD((v_i)::text, 2, '0') || ' sent.' ELSE 'Rev-02 sent.' END, v_user_id),
      (v_vdcr_id, 'received', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (15 - v_i * 3), NULL, CURRENT_TIMESTAMP - INTERVAL '1 day' * (15 - v_i * 3), 3, CASE WHEN v_i < 4 THEN 'Received. Comments on cyclone inlet.' ELSE 'Received. Revise cyclone inlet per client.' END, v_user_id);
    END LOOP;
  END LOOP;
  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id_3 AND sr_no IN ('2','3')
  LOOP
    FOR v_i IN 0..5 LOOP
      INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
      VALUES
      (v_vdcr_id, 'submitted', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (50 - v_i * 7), CURRENT_TIMESTAMP - INTERVAL '1 day' * (44 - v_i * 7), NULL, NULL, CASE WHEN v_i = 0 THEN 'Document sent to client.' WHEN v_i < 5 THEN 'Rev-' || LPAD((v_i)::text, 2, '0') || ' sent.' ELSE 'Final sent.' END, v_user_id),
      (v_vdcr_id, 'received', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (44 - v_i * 7), NULL, CURRENT_TIMESTAMP - INTERVAL '1 day' * (44 - v_i * 7), 6, CASE WHEN v_i < 5 THEN 'Received. Comments. Resubmit.' ELSE 'Received. Approved.' END, v_user_id);
    END LOOP;
  END LOOP;

  -- ========== 21. PROJECT MEMBERS FOR PROJECT 3 (with equipment_assignments) ==========
  INSERT INTO public.project_members (project_id, name, email, position, role, status, user_id, equipment_assignments)
  VALUES
  (v_project_id_3, 'Gaurav Singh', 'gaurav.singh@company.com', 'Project Manager', 'project_manager', 'active', v_user_id, '["All Equipment"]'::jsonb),
  (v_project_id_3, 'Vikram Sharma', 'vikram.sharma@company.com', 'Fabrication Supervisor', 'editor', 'active', v_user_id, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_3 AND tag_number = 'V-601')),
  (v_project_id_3, 'Priya Mehta', 'priya.mehta@company.com', 'Design Engineer', 'editor', 'active', v_user_id, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_3 AND tag_number = ANY(ARRAY['R-601','R-602','V-602','E-601','E-602','D-601','S-601']))),
  (v_project_id_3, 'Arun Nair', 'arun.nair@company.com', 'VDCR Manager', 'vdcr_manager', 'active', v_user_id, '["All Equipment"]'::jsonb),
  (v_project_id_3, 'Ramesh Patel', 'ramesh.patel@company.com', 'Fabricator', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_3 AND tag_number = 'V-601')),
  (v_project_id_3, 'Anil Deshmukh', 'anil.deshmukh@company.com', 'QC Inspector', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_3)),
  (v_project_id_3, 'Kavita Rao', 'kavita.rao@company.com', 'Documentation Lead', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_3));

  UPDATE public.projects SET equipment_count = 8, active_equipment = 8 WHERE id = v_project_id_3;

  -- ========== 22. PROJECT 4: MRPL Mangalore - Delayed Coker Drums & Vessels ==========
  INSERT INTO public.projects (
    name, client, location, manager, deadline, po_number, firm_id, created_by,
    project_manager_id, vdcr_manager_id, scope_of_work, status, sales_order_date,
    client_industry, client_focal_point, tpi_agency, vdcr_manager, consultant,
    kickoff_meeting_notes, special_production_notes, services_included,
    equipment_count, active_equipment, progress
  ) VALUES (
    'MRPL Mangalore - Delayed Coker Drums & Vessels',
    'Mangalore Refinery and Petrochemicals Limited',
    'Mangalore Refinery, Karnataka',
    'Gaurav Singh',
    CURRENT_DATE + INTERVAL '20 months',
    'PO-MRPL-2024-5187',
    v_firm_id,
    v_user_id,
    v_user_id,
    v_user_id,
    'Supply of 7 pressure equipment items for delayed coker unit: 2 coke drums, 2 fractionator vessels, 2 heat exchangers, 1 blowdown drum. ASME VIII Div.1. Full VDCR cycle.',
    'active',
    CURRENT_DATE - INTERVAL '15 days',
    'Oil & Gas',
    'Venkat Reddy - Lead Engineer',
    'TÜV SÜD',
    'Arun Nair',
    'Bureau Veritas - Design Review',
    '- Kickoff 15 days ago. Coke drums critical path. Client expects first submissions within 8 weeks.',
    '- SA-516 Gr.70 for coke drums. 410S clad for high temp zones. Material lead 14 weeks.',
    '{"design": true, "testing": true, "documentation": true, "manufacturing": true}'::jsonb,
    7, 7, 8
  )
  RETURNING id INTO v_project_id_4;

  -- ========== 23. EQUIPMENT FOR PROJECT 4 (7 items) - FULL detail like Project 1 ==========
  INSERT INTO public.equipment (
    project_id, type, tag_number, job_number, manufacturing_serial, name, size, material,
    design_code, status, progress, progress_phase, supervisor, welder, qc_inspector,
    project_manager, location, next_milestone, next_milestone_date, priority,
    custom_field_1_name, custom_field_1_value, custom_field_2_name, custom_field_2_value,
    custom_field_3_name, custom_field_3_value, custom_field_4_name, custom_field_4_value,
    custom_field_5_name, custom_field_5_value, custom_field_6_name, custom_field_6_value,
    custom_field_7_name, custom_field_7_value, custom_field_8_name, custom_field_8_value,
    notes, created_by, technical_sections, last_update
  ) VALUES
  (v_project_id_4, 'Pressure Vessel', 'V-701', 'JOB-MRPL-5187-01', 'Coke Drum A - 24ft Dia', 'Coke Drum A', '288" ID x 95'' T/T', 'SA-516 Gr.70 + 6mm 410S clad', 'ASME VIII Div.1', 'documentation', 18, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Design', 'Design calc Rev-02 approval', CURRENT_DATE + INTERVAL '24 days', 'high',
   'Design Pressure', '95 psig', 'Design Temp', '1050°F', 'MAWP', '110 psig', 'Corrosion Allowance', '6mm', 'Hydro Test', '142 psig', 'Operating Pressure', '75 psig', 'Cycles', '2 per day', 'Lining', '410S 6mm clad',
   'Coke drum A. 288" ID, 95'' T/T. SA-516 Gr.70 + 6mm 410S clad. 2 cycles per day. Design calc Rev-02 under client review. Long lead - material enquiry sent. Critical path.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"290 inch"},{"name":"ID","value":"288 inch"},{"name":"Thickness","value":"32mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Cladding","value":"410S 6mm"},{"name":"Corrosion Allowance","value":"6mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"},{"name":"Thickness","value":"36mm"},{"name":"Cladding","value":"410S 6mm"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"95 psig"},{"name":"Design Temp","value":"1050°F"},{"name":"MAWP","value":"110 psig"},{"name":"Cycles","value":"2 per day"}]},{"name":"Nozzles","customFields":[{"name":"Feed Inlet","value":"24 inch"},{"name":"Vapour Outlet","value":"18 inch"},{"name":"Quench Inlet","value":"12 inch"},{"name":"Drain","value":"8 inch"}]}]'::jsonb, CURRENT_DATE - 3),
  (v_project_id_4, 'Pressure Vessel', 'V-702', 'JOB-MRPL-5187-02', 'Coke Drum B - 24ft Dia', 'Coke Drum B', '288" ID x 95'' T/T', 'SA-516 Gr.70 + 6mm 410S clad', 'ASME VIII Div.1', 'documentation', 15, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Design', 'Datasheet Rev-00 submission', CURRENT_DATE + INTERVAL '28 days', 'high',
   'Design Pressure', '95 psig', 'Design Temp', '1050°F', 'MAWP', '110 psig', 'Corrosion Allowance', '6mm', 'Hydro Test', '142 psig', 'Operating Pressure', '75 psig', 'Cycles', '2 per day', 'Lining', '410S 6mm clad',
   'Coke drum B. Identical to V-701. 288" ID, 95'' T/T. Datasheet Rev-00 in preparation. Awaiting design calc approval for drum A.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"290 inch"},{"name":"ID","value":"288 inch"},{"name":"Thickness","value":"32mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Cladding","value":"410S 6mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"},{"name":"Thickness","value":"36mm"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"95 psig"},{"name":"Design Temp","value":"1050°F"}]},{"name":"Nozzles","customFields":[{"name":"Feed Inlet","value":"24 inch"},{"name":"Vapour Outlet","value":"18 inch"}]}]'::jsonb, CURRENT_DATE - 5),
  (v_project_id_4, 'Column', 'C-701', 'JOB-MRPL-5187-03', 'Coker Fractionator - 22 Tray', 'Coker Fractionator', '120" ID x 72'' T/T - 22 trays', 'SA-516 Gr.70', 'ASME VIII Div.1', 'documentation', 22, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'Datasheet Rev-01 approval', CURRENT_DATE + INTERVAL '18 days', 'high',
   'Design Pressure', '45 psig', 'Design Temp', '850°F', 'MAWP', '52 psig', 'Trays', '22', 'Tray Type', 'Sieve', 'Corrosion Allowance', '3mm', 'Hydro Test', '68 psig', 'Operating Pressure', '38 psig',
   'Coker fractionator 120" ID, 72'' T/T. 22 sieve trays. 8'' feed, 6'' O/H, 4x 6'' side draws. Datasheet Rev-01 under client review. GA drawing in progress.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"122 inch"},{"name":"ID","value":"120 inch"},{"name":"Thickness","value":"14.3mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"T/T Length","value":"72 ft"},{"name":"Corrosion Allowance","value":"3mm"}]},{"name":"Heads","customFields":[{"name":"Top Head","value":"2:1 SE"},{"name":"Bottom Head","value":"2:1 SE"}]},{"name":"Internals","customFields":[{"name":"Tray Type","value":"Sieve"},{"name":"Tray Count","value":"22"},{"name":"Tray Spacing","value":"30 inch"},{"name":"Downcomer","value":"Standard"}]},{"name":"Nozzles","customFields":[{"name":"Feed","value":"8 inch"},{"name":"Overhead","value":"6 inch"},{"name":"Side Draws","value":"4x 6 inch"}]}]'::jsonb, CURRENT_DATE - 6),
  (v_project_id_4, 'Separator', 'V-703', 'JOB-MRPL-5187-04', 'HP Flash Drum - 72 inch', 'HP Flash Drum', '72" ID x 28'' T/T', 'SA-516 Gr.70', 'ASME VIII Div.1', 'in-progress', 42, 'fabrication', 'Vikram Sharma', 'Ramesh Patel', 'Anil Deshmukh', 'Gaurav Singh', 'Shop A', 'Shell weld NDT', CURRENT_DATE + INTERVAL '8 days', 'high',
   'Design Pressure', '85 psig', 'Design Temp', '750°F', 'MAWP', '95 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '127 psig', 'Operating Pressure', '65 psig', 'Retention Time', '8 min', 'Demister', 'Yes',
   'HP flash drum 72" ID, 28'' T/T. Demister pad. 4'' inlet, 2x 6'' liquid, 1x 8'' vapour. Shell rolling done. Longitudinal weld fit-up in progress.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"74 inch"},{"name":"ID","value":"72 inch"},{"name":"Thickness","value":"12.7mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Corrosion Allowance","value":"3mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"},{"name":"Thickness","value":"14.3mm"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"85 psig"},{"name":"Design Temp","value":"750°F"},{"name":"Retention Time","value":"8 min"}]},{"name":"Internals","customFields":[{"name":"Demister","value":"Yes"},{"name":"Inlet","value":"4 inch"},{"name":"Liquid Outlets","value":"2x 6 inch"},{"name":"Vapour Outlet","value":"8 inch"}]}]'::jsonb, CURRENT_DATE - 2),
  (v_project_id_4, 'Heat Exchanger', 'E-701', 'JOB-MRPL-5187-05', 'Coker Feed Preheat Exchanger', 'Coker Feed Preheat Exchanger', '48" Shell x 28''', 'SA-516 Gr.70 / SA-213 T11', 'ASME VIII Div.1, TEMA B', 'pending', 10, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Pending', 'P&ID Rev-06 approval', CURRENT_DATE + INTERVAL '26 days', 'high',
   'Design Pressure Shell', '120 psig', 'Design Pressure Tube', '180 psig', 'Design Temp', '950°F', 'TEMA Class', 'BEM', 'Tube Count', '480', 'Baffle Cut', '25%', 'Hydro Test Shell', '180 psig', 'Hydro Test Tube', '270 psig',
   'Coker feed preheat exchanger. 48" shell, 480 tubes 1" OD. SA-213 T11 for high temp. Awaiting P&ID Rev-06 approval. Material enquiry sent.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"50 inch"},{"name":"ID","value":"48 inch"},{"name":"Thickness","value":"14.3mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Design Pressure","value":"120 psig"},{"name":"Design Temp","value":"950°F"}]},{"name":"Tube Bundle","customFields":[{"name":"Tube OD","value":"1 inch"},{"name":"Tube Count","value":"480"},{"name":"Material","value":"SA-213 T11"},{"name":"Passes","value":"2"},{"name":"Design Pressure","value":"180 psig"}]},{"name":"Baffles","customFields":[{"name":"Type","value":"Single segmental"},{"name":"Cut","value":"25%"},{"name":"Spacing","value":"14 inch"}]},{"name":"TEMA","customFields":[{"name":"Class","value":"BEM"},{"name":"Front Head","value":"B"},{"name":"Shell","value":"E"},{"name":"Rear Head","value":"M"}]}]'::jsonb, CURRENT_DATE - 10),
  (v_project_id_4, 'Heat Exchanger', 'E-702', 'JOB-MRPL-5187-06', 'Overhead Condenser', 'Overhead Condenser', '36" Shell x 18''', 'SA-516 Gr.70 / SA-179', 'ASME VIII Div.1, TEMA B', 'documentation', 20, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'Datasheet Rev-00 submission', CURRENT_DATE + INTERVAL '20 days', 'medium',
   'Design Pressure Shell', '75 psig', 'Design Pressure Tube', '100 psig', 'Design Temp', '450°F', 'TEMA Class', 'B', 'Tube Count', '280', 'Baffle Cut', '20%', 'Hydro Test Shell', '112 psig', 'Hydro Test Tube', '150 psig',
   'Overhead condenser 36" shell, 18'' T/T. 280 tubes. SA-179. Datasheet Rev-00 in preparation. P&ID inputs awaited.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"38 inch"},{"name":"ID","value":"36 inch"},{"name":"Thickness","value":"9.5mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Design Pressure","value":"75 psig"},{"name":"Design Temp","value":"450°F"}]},{"name":"Tube Bundle","customFields":[{"name":"Tube OD","value":"3/4 inch"},{"name":"Tube Count","value":"280"},{"name":"Material","value":"SA-179"},{"name":"Passes","value":"2"}]},{"name":"Baffles","customFields":[{"name":"Cut","value":"20%"},{"name":"Spacing","value":"10 inch"}]}]'::jsonb, CURRENT_DATE - 8),
  (v_project_id_4, 'Drum', 'D-701', 'JOB-MRPL-5187-07', 'Blowdown Drum - Horizontal', 'Blowdown Drum', '60" ID x 24'' T/T', 'SA-516 Gr.70', 'ASME VIII Div.1', 'documentation', 25, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'GA Rev-01 submission', CURRENT_DATE + INTERVAL '16 days', 'medium',
   'Design Pressure', '55 psig', 'Design Temp', '550°F', 'MAWP', '60 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '82 psig', 'Operating Pressure', '42 psig', 'Liquid Level', '50%', 'Status', 'Documentation',
   'Blowdown drum 60" ID, 24'' T/T. Horizontal. 6'' inlet, 2x 5'' liquid, 1x 8'' vapour. GA Rev-01 in progress. Simple vessel.', v_user_id,
   '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"62 inch"},{"name":"ID","value":"60 inch"},{"name":"Thickness","value":"10.3mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Corrosion Allowance","value":"3mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"},{"name":"Thickness","value":"11.1mm"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"55 psig"},{"name":"Design Temp","value":"550°F"},{"name":"MAWP","value":"60 psig"}]},{"name":"Nozzles","customFields":[{"name":"Inlet","value":"6 inch"},{"name":"Liquid Outlets","value":"2x 5 inch"},{"name":"Vapour Outlet","value":"8 inch"}]}]'::jsonb, CURRENT_DATE - 6);

  -- ========== 24. EQUIPMENT TEAM, PROGRESS, DOCUMENTS FOR PROJECT 4 ==========
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_4
  LOOP
    INSERT INTO public.equipment_team_positions (equipment_id, position_name, person_name, email, phone, role) VALUES
    (v_equip_id, 'Project Manager', 'Gaurav Singh', 'gaurav.singh@company.com', '+91-98765-43200', 'editor'),
    (v_equip_id, 'VDCR Manager', 'Arun Nair', 'arun.nair@company.com', '+91-98765-43211', 'editor'),
    (v_equip_id, 'Supervisor', 'Vikram Sharma', 'vikram.sharma@company.com', '+91-98765-43212', 'editor'),
    (v_equip_id, 'Design Engineer', 'Priya Mehta', 'priya.mehta@company.com', '+91-98765-43210', 'editor'),
    (v_equip_id, 'Documentation Lead', 'Kavita Rao', 'kavita.rao@company.com', '+91-98765-43216', 'editor'),
    (v_equip_id, 'QC Inspector', 'Anil Deshmukh', 'anil.deshmukh@company.com', '+91-98765-43215', 'editor');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_4 AND tag_number = 'V-703'
  LOOP
    INSERT INTO public.equipment_team_positions (equipment_id, position_name, person_name, email, phone, role) VALUES
    (v_equip_id, 'Fabricator', 'Ramesh Patel', 'ramesh.patel@company.com', '+91-98765-43213', 'editor'),
    (v_equip_id, 'Welder', 'Suresh Kumar', 'suresh.kumar@company.com', '+91-98765-43214', 'editor');
  END LOOP;

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_4 AND tag_number IN ('V-701','V-702')
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'Design calc Rev-02 under client review. Comments on clad thickness.', 'update'),
    (v_equip_id, 'Material enquiry sent for SA-516 Gr.70. Lead 14 weeks.', 'update'),
    (v_equip_id, 'Datasheet Rev-00 in preparation. Awaiting design calc approval.', 'milestone');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_4 AND tag_number = 'C-701'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'Datasheet Rev-01 submitted to client. Awaiting approval.', 'milestone'),
    (v_equip_id, 'GA drawing Rev-00 in progress. Tray layout finalised.', 'update');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_4 AND tag_number = 'V-703'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'Shell rolling complete. Fit-up for longitudinal weld.', 'update'),
    (v_equip_id, 'Datasheet Rev-04 approved. Proceeding to fabrication.', 'milestone'),
    (v_equip_id, 'Shell plates received. MTR verified. Rolling in progress.', 'update');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_4 AND tag_number = 'E-701'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'P&ID Rev-06 under client review. Feed preheat duty finalised.', 'update'),
    (v_equip_id, 'Material enquiry sent for SA-213 T11 tubes. Lead 12 weeks.', 'update');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_4 AND tag_number = 'E-702'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'Datasheet Rev-00 in preparation. Awaiting P&ID inputs.', 'update'),
    (v_equip_id, 'Overhead condenser duty under review.', 'update');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_4 AND tag_number = 'D-701'
  LOOP
    INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES
    (v_equip_id, 'GA Rev-01 in progress. Nozzle schedule finalised.', 'update'),
    (v_equip_id, 'Datasheet Rev-00 approved. Proceeding to GA.', 'milestone');
  END LOOP;

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_4 AND tag_number = 'V-701'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'V-701-Design-Calculation-Rev02', 'https://storage.example.com/docs/MRPL-V-701-Design-Calc.pdf', 'calculation'),
    (v_equip_id, 'V-701-Datasheet-Rev00', 'https://storage.example.com/docs/MRPL-V-701-Datasheet.pdf', 'datasheet'),
    (v_equip_id, 'V-701-Test-Procedure', 'https://storage.example.com/docs/MRPL-V-701-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'V-701-Hydro-Test-Procedure', 'https://storage.example.com/docs/MRPL-V-701-Hydro-Procedure.pdf', 'procedure'),
    (v_equip_id, 'V-701-Test-Certificate', 'https://storage.example.com/docs/MRPL-V-701-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-701-NDT-Certificate', 'https://storage.example.com/docs/MRPL-V-701-NDT-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-701-MTR-Shell-Material', 'https://storage.example.com/docs/MRPL-V-701-MTR-Shell.pdf', 'mtr'),
    (v_equip_id, 'V-701-Material-Test-Certificate', 'https://storage.example.com/docs/MRPL-V-701-MTC.pdf', 'certificate'),
    (v_equip_id, 'V-701-Calibration-Certificate', 'https://storage.example.com/docs/MRPL-V-701-Calibration-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_4 AND tag_number = 'V-702'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'V-702-Design-Calculation-Rev02', 'https://storage.example.com/docs/MRPL-V-702-Design-Calc.pdf', 'calculation'),
    (v_equip_id, 'V-702-Datasheet-Rev00', 'https://storage.example.com/docs/MRPL-V-702-Datasheet.pdf', 'datasheet'),
    (v_equip_id, 'V-702-Test-Procedure', 'https://storage.example.com/docs/MRPL-V-702-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'V-702-Hydro-Test-Procedure', 'https://storage.example.com/docs/MRPL-V-702-Hydro-Procedure.pdf', 'procedure'),
    (v_equip_id, 'V-702-Test-Certificate', 'https://storage.example.com/docs/MRPL-V-702-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-702-NDT-Certificate', 'https://storage.example.com/docs/MRPL-V-702-NDT-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-702-MTR-Shell-Material', 'https://storage.example.com/docs/MRPL-V-702-MTR-Shell.pdf', 'mtr'),
    (v_equip_id, 'V-702-Material-Test-Certificate', 'https://storage.example.com/docs/MRPL-V-702-MTC.pdf', 'certificate'),
    (v_equip_id, 'V-702-Calibration-Certificate', 'https://storage.example.com/docs/MRPL-V-702-Calibration-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_4 AND tag_number = 'C-701'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'C-701-Datasheet-Rev01', 'https://storage.example.com/docs/MRPL-C-701-Datasheet-Rev01.pdf', 'datasheet'),
    (v_equip_id, 'C-701-Tray-Layout', 'https://storage.example.com/docs/MRPL-C-701-Tray-Layout.pdf', 'drawing'),
    (v_equip_id, 'C-701-Material-Take-Off', 'https://storage.example.com/docs/MRPL-C-701-MTO.pdf', 'mto'),
    (v_equip_id, 'C-701-Design-Calculation', 'https://storage.example.com/docs/MRPL-C-701-Design-Calc.pdf', 'calculation'),
    (v_equip_id, 'C-701-Test-Procedure', 'https://storage.example.com/docs/MRPL-C-701-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'C-701-Test-Certificate', 'https://storage.example.com/docs/MRPL-C-701-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'C-701-Hydro-Test-Certificate', 'https://storage.example.com/docs/MRPL-C-701-Hydro-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'C-701-Material-Test-Certificate', 'https://storage.example.com/docs/MRPL-C-701-MTC.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_4 AND tag_number = 'V-703'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'V-703-Datasheet-Rev04', 'https://storage.example.com/docs/MRPL-V-703-Datasheet-Rev04.pdf', 'datasheet'),
    (v_equip_id, 'V-703-General-Arrangement-Rev02', 'https://storage.example.com/docs/MRPL-V-703-GA-Rev02.pdf', 'drawing'),
    (v_equip_id, 'V-703-Fabrication-Drawing-Rev05', 'https://storage.example.com/docs/MRPL-V-703-Fab-Drawing-Rev05.pdf', 'drawing'),
    (v_equip_id, 'V-703-MTR-Shell', 'https://storage.example.com/docs/MRPL-V-703-MTR-Shell.pdf', 'mtr'),
    (v_equip_id, 'V-703-MTR-Heads', 'https://storage.example.com/docs/MRPL-V-703-MTR-Heads.pdf', 'mtr'),
    (v_equip_id, 'V-703-WPS-PQR', 'https://storage.example.com/docs/MRPL-V-703-WPS-PQR.pdf', 'wps'),
    (v_equip_id, 'V-703-Weld-Map', 'https://storage.example.com/docs/MRPL-V-703-Weld-Map.pdf', 'drawing'),
    (v_equip_id, 'V-703-Test-Procedure', 'https://storage.example.com/docs/MRPL-V-703-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'V-703-Hydro-Test-Certificate', 'https://storage.example.com/docs/MRPL-V-703-Hydro-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-703-Test-Certificate', 'https://storage.example.com/docs/MRPL-V-703-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-703-NDT-Report-RT', 'https://storage.example.com/docs/MRPL-V-703-NDT-RT.pdf', 'report'),
    (v_equip_id, 'V-703-NDT-Certificate', 'https://storage.example.com/docs/MRPL-V-703-NDT-Cert.pdf', 'certificate'),
    (v_equip_id, 'V-703-Material-Test-Certificate', 'https://storage.example.com/docs/MRPL-V-703-MTC.pdf', 'certificate'),
    (v_equip_id, 'V-703-Calibration-Certificate', 'https://storage.example.com/docs/MRPL-V-703-Calibration-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_4 AND tag_number = 'E-701'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'E-701-Datasheet-Rev00', 'https://storage.example.com/docs/MRPL-E-701-Datasheet-Rev00.pdf', 'datasheet'),
    (v_equip_id, 'E-701-Shell-Drawing', 'https://storage.example.com/docs/MRPL-E-701-Shell-Drawing.pdf', 'drawing'),
    (v_equip_id, 'E-701-Tube-Bundle-Drawing', 'https://storage.example.com/docs/MRPL-E-701-Tube-Bundle-Drawing.pdf', 'drawing'),
    (v_equip_id, 'E-701-MTR-Shell', 'https://storage.example.com/docs/MRPL-E-701-MTR-Shell.pdf', 'mtr'),
    (v_equip_id, 'E-701-MTR-Tubes', 'https://storage.example.com/docs/MRPL-E-701-MTR-Tubes.pdf', 'mtr'),
    (v_equip_id, 'E-701-Tube-Layout', 'https://storage.example.com/docs/MRPL-E-701-Tube-Layout.pdf', 'drawing'),
    (v_equip_id, 'E-701-Design-Calculation', 'https://storage.example.com/docs/MRPL-E-701-Design-Calc.pdf', 'calculation'),
    (v_equip_id, 'E-701-Test-Procedure', 'https://storage.example.com/docs/MRPL-E-701-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'E-701-Hydro-Test-Certificate', 'https://storage.example.com/docs/MRPL-E-701-Hydro-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'E-701-Test-Certificate', 'https://storage.example.com/docs/MRPL-E-701-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'E-701-NDT-Certificate', 'https://storage.example.com/docs/MRPL-E-701-NDT-Cert.pdf', 'certificate'),
    (v_equip_id, 'E-701-Material-Test-Certificate', 'https://storage.example.com/docs/MRPL-E-701-MTC.pdf', 'certificate'),
    (v_equip_id, 'E-701-Calibration-Certificate', 'https://storage.example.com/docs/MRPL-E-701-Calibration-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_4 AND tag_number = 'E-702'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'E-702-Datasheet-Rev00', 'https://storage.example.com/docs/MRPL-E-702-Datasheet-Rev00.pdf', 'datasheet'),
    (v_equip_id, 'E-702-Shell-Drawing', 'https://storage.example.com/docs/MRPL-E-702-Shell-Drawing.pdf', 'drawing'),
    (v_equip_id, 'E-702-Tube-Bundle-Drawing', 'https://storage.example.com/docs/MRPL-E-702-Tube-Bundle-Drawing.pdf', 'drawing'),
    (v_equip_id, 'E-702-MTR-Shell', 'https://storage.example.com/docs/MRPL-E-702-MTR-Shell.pdf', 'mtr'),
    (v_equip_id, 'E-702-MTR-Tubes', 'https://storage.example.com/docs/MRPL-E-702-MTR-Tubes.pdf', 'mtr'),
    (v_equip_id, 'E-702-Test-Procedure', 'https://storage.example.com/docs/MRPL-E-702-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'E-702-Hydro-Test-Certificate', 'https://storage.example.com/docs/MRPL-E-702-Hydro-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'E-702-Test-Certificate', 'https://storage.example.com/docs/MRPL-E-702-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'E-702-Material-Test-Certificate', 'https://storage.example.com/docs/MRPL-E-702-MTC.pdf', 'certificate'),
    (v_equip_id, 'E-702-Calibration-Certificate', 'https://storage.example.com/docs/MRPL-E-702-Calibration-Cert.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_4 AND tag_number = 'D-701'
  LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES
    (v_equip_id, 'D-701-Datasheet-Rev00', 'https://storage.example.com/docs/MRPL-D-701-Datasheet.pdf', 'datasheet'),
    (v_equip_id, 'D-701-GA-Rev01', 'https://storage.example.com/docs/MRPL-D-701-GA-Rev01.pdf', 'drawing'),
    (v_equip_id, 'D-701-Design-Calculation', 'https://storage.example.com/docs/MRPL-D-701-Design-Calc.pdf', 'calculation'),
    (v_equip_id, 'D-701-MTR-Package', 'https://storage.example.com/docs/MRPL-D-701-MTR-Package.pdf', 'mtr'),
    (v_equip_id, 'D-701-Test-Procedure', 'https://storage.example.com/docs/MRPL-D-701-Test-Procedure.pdf', 'procedure'),
    (v_equip_id, 'D-701-Test-Certificate', 'https://storage.example.com/docs/MRPL-D-701-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'D-701-Hydro-Test-Certificate', 'https://storage.example.com/docs/MRPL-D-701-Hydro-Test-Cert.pdf', 'certificate'),
    (v_equip_id, 'D-701-NDT-Report', 'https://storage.example.com/docs/MRPL-D-701-NDT-Report.pdf', 'report'),
    (v_equip_id, 'D-701-Material-Test-Certificate', 'https://storage.example.com/docs/MRPL-D-701-MTC.pdf', 'certificate'),
    (v_equip_id, 'D-701-Calibration-Certificate', 'https://storage.example.com/docs/MRPL-D-701-Calibration-Cert.pdf', 'certificate');
  END LOOP;

  -- ========== 25. VDCR RECORDS & EVENTS FOR PROJECT 4 ==========
  INSERT INTO public.vdcr_records (project_id, firm_id, sr_no, equipment_tag_numbers, mfg_serial_numbers, job_numbers, client_doc_no, internal_doc_no, document_name, revision, code_status, status, department, remarks, project_documentation_start_date)
  VALUES
  (v_project_id_4, v_firm_id, '1', ARRAY['V-701'], ARRAY['Coke Drum A - 24ft Dia'], ARRAY['JOB-MRPL-5187-01'], 'MRPL-DOC-401', 'VDCR-5187-001', 'Design Calculation', 'Rev-02', 'Code 1', 'received-for-comment', 'Mechanical', 'Revise clad thickness per client.', CURRENT_DATE - INTERVAL '12 days'),
  (v_project_id_4, v_firm_id, '2', ARRAY['C-701'], ARRAY['Coker Fractionator - 22 Tray'], ARRAY['JOB-MRPL-5187-03'], 'MRPL-DOC-402', 'VDCR-5187-002', 'Datasheet', 'Rev-01', 'Code 1', 'approved', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '40 days'),
  (v_project_id_4, v_firm_id, '3', ARRAY['V-703'], ARRAY['HP Flash Drum - 72 inch'], ARRAY['JOB-MRPL-5187-04'], 'MRPL-DOC-403', 'VDCR-5187-003', 'Datasheet', 'Rev-04', 'Code 1', 'approved', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '50 days'),
  (v_project_id_4, v_firm_id, '4', ARRAY['V-703'], ARRAY['HP Flash Drum - 72 inch'], ARRAY['JOB-MRPL-5187-04'], 'MRPL-DOC-404', 'VDCR-5187-004', 'Fabrication Drawing', 'Rev-05', 'Code 1', 'sent-for-approval', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '60 days'),
  (v_project_id_4, v_firm_id, '5', ARRAY['D-701'], ARRAY['Blowdown Drum - Horizontal'], ARRAY['JOB-MRPL-5187-07'], 'MRPL-DOC-405', 'VDCR-5187-005', 'General Arrangement', 'Rev-01', 'Code 2', 'approved', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '18 days'),
  (v_project_id_4, v_firm_id, '6', ARRAY['V-701','V-702','C-701','V-703'], ARRAY['Coke Drum A - 24ft Dia','Coke Drum B - 24ft Dia','Coker Fractionator - 22 Tray','HP Flash Drum - 72 inch'], ARRAY['JOB-MRPL-5187-01','JOB-MRPL-5187-02','JOB-MRPL-5187-03','JOB-MRPL-5187-04'], 'MRPL-DOC-406', 'VDCR-5187-006', 'Project P&ID', 'Rev-06', 'Code 1', 'approved', 'Process', NULL, CURRENT_DATE - INTERVAL '35 days');

  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id_4 AND sr_no = '1'
  LOOP
    FOR v_i IN 0..4 LOOP
      INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
      VALUES
      (v_vdcr_id, 'submitted', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (12 - v_i * 2), CURRENT_TIMESTAMP - INTERVAL '1 day' * (10 - v_i * 2), NULL, NULL, CASE WHEN v_i = 0 THEN 'Design calc sent to client.' WHEN v_i < 4 THEN 'Rev-' || LPAD((v_i)::text, 2, '0') || ' sent.' ELSE 'Rev-02 sent.' END, v_user_id),
      (v_vdcr_id, 'received', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (10 - v_i * 2), NULL, CURRENT_TIMESTAMP - INTERVAL '1 day' * (10 - v_i * 2), 2, CASE WHEN v_i < 4 THEN 'Received. Comments on clad.' ELSE 'Received. Revise clad thickness per client.' END, v_user_id);
    END LOOP;
  END LOOP;
  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id_4 AND sr_no IN ('2','3','4')
  LOOP
    FOR v_i IN 0..5 LOOP
      INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
      VALUES
      (v_vdcr_id, 'submitted', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (55 - v_i * 8), CURRENT_TIMESTAMP - INTERVAL '1 day' * (48 - v_i * 8), NULL, NULL, CASE WHEN v_i = 0 THEN 'Document sent to client.' WHEN v_i < 5 THEN 'Rev-' || LPAD((v_i)::text, 2, '0') || ' sent.' ELSE 'Final sent.' END, v_user_id),
      (v_vdcr_id, 'received', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (48 - v_i * 8), NULL, CURRENT_TIMESTAMP - INTERVAL '1 day' * (48 - v_i * 8), 7, CASE WHEN v_i < 5 THEN 'Received. Comments. Resubmit.' ELSE 'Received. Approved.' END, v_user_id);
    END LOOP;
  END LOOP;
  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id_4 AND sr_no IN ('5','6')
  LOOP
    FOR v_i IN 0..4 LOOP
      INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
      VALUES
      (v_vdcr_id, 'submitted', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (25 - v_i * 4), CURRENT_TIMESTAMP - INTERVAL '1 day' * (21 - v_i * 4), NULL, NULL, CASE WHEN v_i = 0 THEN 'Document sent.' WHEN v_i < 4 THEN 'Rev-' || LPAD((v_i)::text, 2, '0') || ' sent.' ELSE 'Final sent.' END, v_user_id),
      (v_vdcr_id, 'received', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (21 - v_i * 4), NULL, CURRENT_TIMESTAMP - INTERVAL '1 day' * (21 - v_i * 4), 4, CASE WHEN v_i < 4 THEN 'Received. Resubmit.' ELSE 'Received. Approved.' END, v_user_id);
    END LOOP;
  END LOOP;

  -- ========== 26. PROJECT MEMBERS FOR PROJECT 4 ==========
  INSERT INTO public.project_members (project_id, name, email, position, role, status, user_id, equipment_assignments)
  VALUES
  (v_project_id_4, 'Gaurav Singh', 'gaurav.singh@company.com', 'Project Manager', 'project_manager', 'active', v_user_id, '["All Equipment"]'::jsonb),
  (v_project_id_4, 'Vikram Sharma', 'vikram.sharma@company.com', 'Fabrication Supervisor', 'editor', 'active', v_user_id, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_4 AND tag_number = 'V-703')),
  (v_project_id_4, 'Priya Mehta', 'priya.mehta@company.com', 'Design Engineer', 'editor', 'active', v_user_id, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_4 AND tag_number = ANY(ARRAY['V-701','V-702','C-701','E-701','E-702','D-701']))),
  (v_project_id_4, 'Arun Nair', 'arun.nair@company.com', 'VDCR Manager', 'vdcr_manager', 'active', v_user_id, '["All Equipment"]'::jsonb),
  (v_project_id_4, 'Ramesh Patel', 'ramesh.patel@company.com', 'Fabricator', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_4 AND tag_number = 'V-703')),
  (v_project_id_4, 'Anil Deshmukh', 'anil.deshmukh@company.com', 'QC Inspector', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_4)),
  (v_project_id_4, 'Kavita Rao', 'kavita.rao@company.com', 'Documentation Lead', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_4));

  UPDATE public.projects SET equipment_count = 7, active_equipment = 7 WHERE id = v_project_id_4;

  -- ========== 27. PROJECT 5: ONGC Dahej - Gas Processing Vessels (8 equip) ==========
  INSERT INTO public.projects (name, client, location, manager, deadline, po_number, firm_id, created_by, project_manager_id, vdcr_manager_id, scope_of_work, status, sales_order_date, client_industry, client_focal_point, tpi_agency, vdcr_manager, consultant, kickoff_meeting_notes, special_production_notes, services_included, equipment_count, active_equipment, progress)
  VALUES ('ONGC Dahej - Gas Processing Vessels', 'Oil and Natural Gas Corporation', 'Dahej, Gujarat', 'Gaurav Singh', CURRENT_DATE + INTERVAL '22 months', 'PO-ONGC-2024-6234', v_firm_id, v_user_id, v_user_id, v_user_id, 'Supply of 8 pressure equipment for gas processing: 3 separators, 2 heat exchangers, 1 column, 1 drum, 1 compressor skid. ASME VIII Div.1. Full VDCR cycle.', 'active', CURRENT_DATE - INTERVAL '10 days', 'Oil & Gas', 'Amit Joshi - Lead Engineer', 'Lloyd''s Register', 'Arun Nair', 'Bureau Veritas - Design Review', '- Kickoff 10 days ago. Inlet separator critical path.', '- SA-516 Gr.70. Material lead 8 weeks.', '{"design": true, "testing": true, "documentation": true, "manufacturing": true}'::jsonb, 8, 8, 6)
  RETURNING id INTO v_project_id_5;

  INSERT INTO public.equipment (project_id, type, tag_number, job_number, manufacturing_serial, name, size, material, design_code, status, progress, progress_phase, supervisor, welder, qc_inspector, project_manager, location, next_milestone, next_milestone_date, priority, custom_field_1_name, custom_field_1_value, custom_field_2_name, custom_field_2_value, custom_field_3_name, custom_field_3_value, custom_field_4_name, custom_field_4_value, custom_field_5_name, custom_field_5_value, custom_field_6_name, custom_field_6_value, custom_field_7_name, custom_field_7_value, custom_field_8_name, custom_field_8_value, notes, created_by, technical_sections, last_update)
  VALUES
  (v_project_id_5, 'Separator', 'V-801', 'JOB-ONGC-6234-01', 'Inlet Separator - 84 inch', 'Inlet Separator', '84" ID x 32'' T/T', 'SA-516 Gr.70', 'ASME VIII Div.1', 'documentation', 22, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Design', 'Datasheet Rev-01 approval', CURRENT_DATE + INTERVAL '16 days', 'high', 'Design Pressure', '450 psig', 'Design Temp', '650°F', 'MAWP', '495 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '675 psig', 'Operating Pressure', '380 psig', 'Retention Time', '6 min', 'Demister', 'Yes', 'Inlet separator 84" ID. Gas processing train. Datasheet Rev-01 under client review.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"86 inch"},{"name":"ID","value":"84 inch"},{"name":"Thickness","value":"16mm"},{"name":"Material","value":"SA-516 Gr.70"},{"name":"Corrosion Allowance","value":"3mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"},{"name":"Thickness","value":"17.5mm"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"450 psig"},{"name":"Design Temp","value":"650°F"},{"name":"Retention Time","value":"6 min"}]},{"name":"Internals","customFields":[{"name":"Demister","value":"Yes"},{"name":"Inlet","value":"12 inch"},{"name":"Vapour Outlet","value":"10 inch"}]}]'::jsonb, CURRENT_DATE - 4),
  (v_project_id_5, 'Separator', 'V-802', 'JOB-ONGC-6234-02', 'HP Flash Drum - 60 inch', 'HP Flash Drum', '60" ID x 24'' T/T', 'SA-516 Gr.70', 'ASME VIII Div.1', 'in-progress', 48, 'fabrication', 'Vikram Sharma', 'Ramesh Patel', 'Anil Deshmukh', 'Gaurav Singh', 'Shop A', 'Shell weld NDT', CURRENT_DATE + INTERVAL '6 days', 'high', 'Design Pressure', '320 psig', 'Design Temp', '550°F', 'MAWP', '350 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '480 psig', 'Operating Pressure', '280 psig', 'Retention Time', '5 min', 'Demister', 'Yes', 'HP flash drum 60" ID. Shell rolling done. Longitudinal weld fit-up.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"62 inch"},{"name":"ID","value":"60 inch"},{"name":"Thickness","value":"14.3mm"},{"name":"Material","value":"SA-516 Gr.70"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"},{"name":"Thickness","value":"15.9mm"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"320 psig"},{"name":"MAWP","value":"350 psig"}]},{"name":"Internals","customFields":[{"name":"Demister","value":"Yes"}]}]'::jsonb, CURRENT_DATE - 2),
  (v_project_id_5, 'Heat Exchanger', 'E-801', 'JOB-ONGC-6234-03', 'Feed Gas Cooler', 'Feed Gas Cooler', '42" Shell x 24''', 'SA-516 Gr.70 / SA-179', 'ASME VIII Div.1, TEMA B', 'pending', 12, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Pending', 'P&ID Rev-04 approval', CURRENT_DATE + INTERVAL '22 days', 'high', 'Design Pressure Shell', '180 psig', 'Design Pressure Tube', '220 psig', 'Design Temp', '450°F', 'TEMA Class', 'BEM', 'Tube Count', '380', 'Baffle Cut', '25%', 'Hydro Test Shell', '270 psig', 'Hydro Test Tube', '330 psig', 'Feed gas cooler. Awaiting P&ID.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"44 inch"},{"name":"ID","value":"42 inch"},{"name":"Thickness","value":"12.7mm"},{"name":"Material","value":"SA-516 Gr.70"}]},{"name":"Tube Bundle","customFields":[{"name":"Tube OD","value":"3/4 inch"},{"name":"Tube Count","value":"380"},{"name":"Material","value":"SA-179"}]},{"name":"Baffles","customFields":[{"name":"Cut","value":"25%"},{"name":"Spacing","value":"12 inch"}]}]'::jsonb, CURRENT_DATE - 8),
  (v_project_id_5, 'Heat Exchanger', 'E-802', 'JOB-ONGC-6234-04', 'Overhead Condenser', 'Overhead Condenser', '36" Shell x 18''', 'SA-516 Gr.70 / SA-179', 'ASME VIII Div.1, TEMA B', 'documentation', 25, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'Datasheet Rev-00 submission', CURRENT_DATE + INTERVAL '18 days', 'medium', 'Design Pressure Shell', '95 psig', 'Design Pressure Tube', '120 psig', 'Design Temp', '400°F', 'TEMA Class', 'B', 'Tube Count', '280', 'Baffle Cut', '20%', 'Hydro Test Shell', '142 psig', 'Hydro Test Tube', '180 psig', 'Overhead condenser. Datasheet in preparation.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"38 inch"},{"name":"ID","value":"36 inch"},{"name":"Thickness","value":"9.5mm"}]},{"name":"Tube Bundle","customFields":[{"name":"Tube Count","value":"280"},{"name":"Material","value":"SA-179"}]}]'::jsonb, CURRENT_DATE - 6),
  (v_project_id_5, 'Column', 'C-801', 'JOB-ONGC-6234-05', 'Debutanizer - 16 Tray', 'Debutanizer Column', '96" ID x 52'' T/T - 16 trays', 'SA-516 Gr.70', 'ASME VIII Div.1', 'documentation', 20, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'Datasheet Rev-01 approval', CURRENT_DATE + INTERVAL '20 days', 'high', 'Design Pressure', '185 psig', 'Design Temp', '450°F', 'MAWP', '200 psig', 'Trays', '16', 'Tray Type', 'Sieve', 'Corrosion Allowance', '3mm', 'Hydro Test', '278 psig', 'Operating Pressure', '150 psig', 'Debutanizer 96" ID. 16 sieve trays. Datasheet under review.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"98 inch"},{"name":"ID","value":"96 inch"},{"name":"Thickness","value":"14.3mm"},{"name":"Material","value":"SA-516 Gr.70"}]},{"name":"Internals","customFields":[{"name":"Tray Type","value":"Sieve"},{"name":"Tray Count","value":"16"}]},{"name":"Nozzles","customFields":[{"name":"Feed","value":"8 inch"},{"name":"Overhead","value":"6 inch"}]}]'::jsonb, CURRENT_DATE - 5),
  (v_project_id_5, 'Drum', 'D-801', 'JOB-ONGC-6234-06', 'Reflux Drum - 48 inch', 'Reflux Drum', '48" ID x 20'' T/T', 'SA-516 Gr.70', 'ASME VIII Div.1', 'documentation', 28, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'GA Rev-01 submission', CURRENT_DATE + INTERVAL '14 days', 'medium', 'Design Pressure', '95 psig', 'Design Temp', '450°F', 'MAWP', '105 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '142 psig', 'Operating Pressure', '75 psig', 'Liquid Level', '55%', 'Status', 'Documentation', 'Reflux drum 48" ID. GA Rev-01 in progress.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"50 inch"},{"name":"ID","value":"48 inch"},{"name":"Thickness","value":"10.3mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"95 psig"},{"name":"MAWP","value":"105 psig"}]}]'::jsonb, CURRENT_DATE - 7),
  (v_project_id_5, 'Drum', 'D-802', 'JOB-ONGC-6234-07', 'LPG Storage Drum - 72 inch', 'LPG Storage Drum', '72" ID x 28'' T/T', 'SA-516 Gr.70', 'ASME VIII Div.1', 'pending', 8, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Pending', 'P&ID approval', CURRENT_DATE + INTERVAL '28 days', 'medium', 'Design Pressure', '125 psig', 'Design Temp', '350°F', 'MAWP', '138 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '187 psig', 'Operating Pressure', '95 psig', 'Capacity', '8000 gal', 'Status', 'Design', 'LPG storage drum. Early stage.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"74 inch"},{"name":"ID","value":"72 inch"},{"name":"Thickness","value":"12.7mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"125 psig"},{"name":"Capacity","value":"8000 gal"}]}]'::jsonb, CURRENT_DATE - 10),
  (v_project_id_5, 'Skid', 'S-801', 'JOB-ONGC-6234-08', 'Gas Compressor Skid', 'Gas Compressor Skid', '14'' x 10'' x 8'' base', 'CS base, SS316 compressor', 'ASME B31.3', 'pending', 5, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Pending', 'P&ID & GA approval', CURRENT_DATE + INTERVAL '35 days', 'low', 'Design Pressure', '450 psig', 'Design Temp', '400°F', 'Compressor Type', 'Centrifugal', 'Material', 'SS316', 'Base', 'Carbon steel', 'Piping', 'B31.3', 'Hydro Test', '675 psig', 'Status', 'Design', 'Gas compressor skid. Awaiting P&ID.', v_user_id, '[{"name":"Compressor","customFields":[{"name":"Type","value":"Centrifugal"},{"name":"Material","value":"SS316"}]},{"name":"Skid Base","customFields":[{"name":"Material","value":"Carbon steel"},{"name":"Dimensions","value":"14'' x 10'' x 8''"}]}]'::jsonb, CURRENT_DATE - 12);

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_5 LOOP INSERT INTO public.equipment_team_positions (equipment_id, position_name, person_name, email, phone, role) VALUES (v_equip_id, 'Project Manager', 'Gaurav Singh', 'gaurav.singh@company.com', '+91-98765-43200', 'editor'), (v_equip_id, 'VDCR Manager', 'Arun Nair', 'arun.nair@company.com', '+91-98765-43211', 'editor'), (v_equip_id, 'Supervisor', 'Vikram Sharma', 'vikram.sharma@company.com', '+91-98765-43212', 'editor'), (v_equip_id, 'Design Engineer', 'Priya Mehta', 'priya.mehta@company.com', '+91-98765-43210', 'editor'), (v_equip_id, 'Documentation Lead', 'Kavita Rao', 'kavita.rao@company.com', '+91-98765-43216', 'editor'), (v_equip_id, 'QC Inspector', 'Anil Deshmukh', 'anil.deshmukh@company.com', '+91-98765-43215', 'editor'); END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_5 AND tag_number = 'V-802' LOOP INSERT INTO public.equipment_team_positions (equipment_id, position_name, person_name, email, phone, role) VALUES (v_equip_id, 'Fabricator', 'Ramesh Patel', 'ramesh.patel@company.com', '+91-98765-43213', 'editor'), (v_equip_id, 'Welder', 'Suresh Kumar', 'suresh.kumar@company.com', '+91-98765-43214', 'editor'); END LOOP;

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_5 AND tag_number = 'V-801' LOOP INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES (v_equip_id, 'Datasheet Rev-01 submitted to client. Awaiting approval.', 'milestone'), (v_equip_id, 'GA drawing Rev-00 in progress.', 'update'); END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_5 AND tag_number = 'V-802' LOOP INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES (v_equip_id, 'Shell rolling complete. Fit-up for longitudinal weld.', 'update'), (v_equip_id, 'Datasheet Rev-03 approved. Proceeding to fabrication.', 'milestone'); END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_5 AND tag_number IN ('E-801','E-802','C-801','D-801','D-802','S-801') LOOP INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES (v_equip_id, 'Datasheet in preparation. Awaiting P&ID inputs.', 'update'); END LOOP;

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_5 LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) SELECT v_equip_id, d.n, d.u, d.t FROM (VALUES ('V-801-Datasheet-Rev01','https://storage.example.com/docs/ONGC-V-801-Datasheet.pdf','datasheet'),('V-801-GA-Rev00','https://storage.example.com/docs/ONGC-V-801-GA.pdf','drawing'),('V-801-Test-Procedure','https://storage.example.com/docs/ONGC-V-801-Test-Procedure.pdf','procedure'),('V-801-Test-Certificate','https://storage.example.com/docs/ONGC-V-801-Test-Cert.pdf','certificate'),('V-801-Hydro-Test-Certificate','https://storage.example.com/docs/ONGC-V-801-Hydro-Test-Cert.pdf','certificate'),('V-801-MTR-Shell','https://storage.example.com/docs/ONGC-V-801-MTR-Shell.pdf','mtr'),('V-801-NDT-Certificate','https://storage.example.com/docs/ONGC-V-801-NDT-Cert.pdf','certificate'),('V-801-Material-Test-Certificate','https://storage.example.com/docs/ONGC-V-801-MTC.pdf','certificate')) AS d(n,u,t) WHERE EXISTS (SELECT 1 FROM public.equipment e WHERE e.id = v_equip_id AND e.tag_number = 'V-801');
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) SELECT v_equip_id, d.n, d.u, d.t FROM (VALUES ('V-802-Datasheet-Rev03','https://storage.example.com/docs/ONGC-V-802-Datasheet.pdf','datasheet'),('V-802-Fabrication-Drawing-Rev04','https://storage.example.com/docs/ONGC-V-802-Fab-Drawing.pdf','drawing'),('V-802-MTR-Shell','https://storage.example.com/docs/ONGC-V-802-MTR-Shell.pdf','mtr'),('V-802-WPS-PQR','https://storage.example.com/docs/ONGC-V-802-WPS-PQR.pdf','wps'),('V-802-Test-Procedure','https://storage.example.com/docs/ONGC-V-802-Test-Procedure.pdf','procedure'),('V-802-Hydro-Test-Certificate','https://storage.example.com/docs/ONGC-V-802-Hydro-Test-Cert.pdf','certificate'),('V-802-Test-Certificate','https://storage.example.com/docs/ONGC-V-802-Test-Cert.pdf','certificate'),('V-802-NDT-Certificate','https://storage.example.com/docs/ONGC-V-802-NDT-Cert.pdf','certificate'),('V-802-Material-Test-Certificate','https://storage.example.com/docs/ONGC-V-802-MTC.pdf','certificate')) AS d(n,u,t) WHERE EXISTS (SELECT 1 FROM public.equipment e WHERE e.id = v_equip_id AND e.tag_number = 'V-802');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_5 AND tag_number IN ('E-801','E-802') LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES (v_equip_id, 'Datasheet-Rev00', 'https://storage.example.com/docs/ONGC-Exchanger-Datasheet.pdf', 'datasheet'), (v_equip_id, 'Shell-Drawing', 'https://storage.example.com/docs/ONGC-Exchanger-Shell.pdf', 'drawing'), (v_equip_id, 'Tube-Bundle-Drawing', 'https://storage.example.com/docs/ONGC-Exchanger-Tube-Bundle.pdf', 'drawing'), (v_equip_id, 'Test-Procedure', 'https://storage.example.com/docs/ONGC-Exchanger-Test-Procedure.pdf', 'procedure'), (v_equip_id, 'Test-Certificate', 'https://storage.example.com/docs/ONGC-Exchanger-Test-Cert.pdf', 'certificate'), (v_equip_id, 'Hydro-Test-Certificate', 'https://storage.example.com/docs/ONGC-Exchanger-Hydro-Test-Cert.pdf', 'certificate'), (v_equip_id, 'Material-Test-Certificate', 'https://storage.example.com/docs/ONGC-Exchanger-MTC.pdf', 'certificate');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_5 AND tag_number IN ('C-801','D-801','D-802','S-801') LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES (v_equip_id, 'Datasheet-Rev00', 'https://storage.example.com/docs/ONGC-Datasheet.pdf', 'datasheet'), (v_equip_id, 'GA-Rev00', 'https://storage.example.com/docs/ONGC-GA.pdf', 'drawing'), (v_equip_id, 'Test-Procedure', 'https://storage.example.com/docs/ONGC-Test-Procedure.pdf', 'procedure'), (v_equip_id, 'Test-Certificate', 'https://storage.example.com/docs/ONGC-Test-Cert.pdf', 'certificate'), (v_equip_id, 'Hydro-Test-Certificate', 'https://storage.example.com/docs/ONGC-Hydro-Test-Cert.pdf', 'certificate');
  END LOOP;

  INSERT INTO public.vdcr_records (project_id, firm_id, sr_no, equipment_tag_numbers, mfg_serial_numbers, job_numbers, client_doc_no, internal_doc_no, document_name, revision, code_status, status, department, remarks, project_documentation_start_date)
  VALUES (v_project_id_5, v_firm_id, '1', ARRAY['V-801'], ARRAY['Inlet Separator - 84 inch'], ARRAY['JOB-ONGC-6234-01'], 'ONGC-DOC-501', 'VDCR-6234-001', 'Datasheet', 'Rev-01', 'Code 1', 'received-for-comment', 'Mechanical', 'Minor nozzle comments.', CURRENT_DATE - INTERVAL '8 days'), (v_project_id_5, v_firm_id, '2', ARRAY['V-802'], ARRAY['HP Flash Drum - 60 inch'], ARRAY['JOB-ONGC-6234-02'], 'ONGC-DOC-502', 'VDCR-6234-002', 'Datasheet', 'Rev-03', 'Code 1', 'approved', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '45 days'), (v_project_id_5, v_firm_id, '3', ARRAY['V-802'], ARRAY['HP Flash Drum - 60 inch'], ARRAY['JOB-ONGC-6234-02'], 'ONGC-DOC-503', 'VDCR-6234-003', 'Fabrication Drawing', 'Rev-04', 'Code 1', 'sent-for-approval', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '55 days'), (v_project_id_5, v_firm_id, '4', ARRAY['V-801','V-802','C-801'], ARRAY['Inlet Separator - 84 inch','HP Flash Drum - 60 inch','Debutanizer - 16 Tray'], ARRAY['JOB-ONGC-6234-01','JOB-ONGC-6234-02','JOB-ONGC-6234-05'], 'ONGC-DOC-504', 'VDCR-6234-004', 'Project P&ID', 'Rev-05', 'Code 1', 'approved', 'Process', NULL, CURRENT_DATE - INTERVAL '30 days');

  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id_5 LOOP
    FOR v_i IN 0..4 LOOP
      INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
      VALUES (v_vdcr_id, 'submitted', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (40 - v_i * 7), CURRENT_TIMESTAMP - INTERVAL '1 day' * (34 - v_i * 7), NULL, NULL, CASE WHEN v_i = 0 THEN 'Document sent.' WHEN v_i < 4 THEN 'Rev-' || LPAD((v_i)::text, 2, '0') || ' sent.' ELSE 'Final sent.' END, v_user_id), (v_vdcr_id, 'received', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (34 - v_i * 7), NULL, CURRENT_TIMESTAMP - INTERVAL '1 day' * (34 - v_i * 7), 6, CASE WHEN v_i < 4 THEN 'Received. Resubmit.' ELSE 'Received. Approved.' END, v_user_id);
    END LOOP;
  END LOOP;

  INSERT INTO public.project_members (project_id, name, email, position, role, status, user_id, equipment_assignments)
  VALUES (v_project_id_5, 'Gaurav Singh', 'gaurav.singh@company.com', 'Project Manager', 'project_manager', 'active', v_user_id, '["All Equipment"]'::jsonb), (v_project_id_5, 'Vikram Sharma', 'vikram.sharma@company.com', 'Fabrication Supervisor', 'editor', 'active', v_user_id, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_5 AND tag_number = 'V-802')), (v_project_id_5, 'Priya Mehta', 'priya.mehta@company.com', 'Design Engineer', 'editor', 'active', v_user_id, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_5 AND tag_number = ANY(ARRAY['V-801','E-801','E-802','C-801','D-801','D-802','S-801']))), (v_project_id_5, 'Arun Nair', 'arun.nair@company.com', 'VDCR Manager', 'vdcr_manager', 'active', v_user_id, '["All Equipment"]'::jsonb), (v_project_id_5, 'Ramesh Patel', 'ramesh.patel@company.com', 'Fabricator', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_5 AND tag_number = 'V-802')), (v_project_id_5, 'Anil Deshmukh', 'anil.deshmukh@company.com', 'QC Inspector', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_5)), (v_project_id_5, 'Kavita Rao', 'kavita.rao@company.com', 'Documentation Lead', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_5));

  UPDATE public.projects SET equipment_count = 8, active_equipment = 8 WHERE id = v_project_id_5;

  -- ========== 28. PROJECT 6: GAIL Pata - NGL Fractionation Unit (8 equip) ==========
  INSERT INTO public.projects (name, client, location, manager, deadline, po_number, firm_id, created_by, project_manager_id, vdcr_manager_id, scope_of_work, status, sales_order_date, client_industry, client_focal_point, tpi_agency, vdcr_manager, consultant, kickoff_meeting_notes, special_production_notes, services_included, equipment_count, active_equipment, progress)
  VALUES ('GAIL Pata - NGL Fractionation Unit', 'GAIL (India) Limited', 'Pata, Uttar Pradesh', 'Gaurav Singh', CURRENT_DATE + INTERVAL '18 months', 'PO-GAIL-2024-7156', v_firm_id, v_user_id, v_user_id, v_user_id, 'Supply of 8 pressure equipment for NGL fractionation: 2 columns, 2 separators, 2 heat exchangers, 2 drums. ASME VIII Div.1. Full VDCR cycle.', 'active', CURRENT_DATE - INTERVAL '8 days', 'Oil & Gas', 'Sanjay Verma - Lead Engineer', 'TÜV SÜD', 'Arun Nair', 'Lloyd''s Register - Design Review', '- Kickoff 8 days ago. Deethanizer critical path.', '- SA-516 Gr.70. Material lead 10 weeks.', '{"design": true, "testing": true, "documentation": true, "manufacturing": true}'::jsonb, 8, 8, 5)
  RETURNING id INTO v_project_id_6;

  INSERT INTO public.equipment (project_id, type, tag_number, job_number, manufacturing_serial, name, size, material, design_code, status, progress, progress_phase, supervisor, welder, qc_inspector, project_manager, location, next_milestone, next_milestone_date, priority, custom_field_1_name, custom_field_1_value, custom_field_2_name, custom_field_2_value, custom_field_3_name, custom_field_3_value, custom_field_4_name, custom_field_4_value, custom_field_5_name, custom_field_5_value, custom_field_6_name, custom_field_6_value, custom_field_7_name, custom_field_7_value, custom_field_8_name, custom_field_8_value, notes, created_by, technical_sections, last_update)
  VALUES
  (v_project_id_6, 'Column', 'C-901', 'JOB-GAIL-7156-01', 'Deethanizer - 20 Tray', 'Deethanizer Column', '108" ID x 58'' T/T - 20 trays', 'SA-516 Gr.70', 'ASME VIII Div.1', 'documentation', 18, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Design', 'Datasheet Rev-02 approval', CURRENT_DATE + INTERVAL '20 days', 'high', 'Design Pressure', '220 psig', 'Design Temp', '500°F', 'MAWP', '242 psig', 'Trays', '20', 'Tray Type', 'Sieve', 'Corrosion Allowance', '3mm', 'Hydro Test', '330 psig', 'Operating Pressure', '180 psig', 'Deethanizer 108" ID. 20 sieve trays. Datasheet Rev-02 under review.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"110 inch"},{"name":"ID","value":"108 inch"},{"name":"Thickness","value":"16mm"},{"name":"Material","value":"SA-516 Gr.70"}]},{"name":"Internals","customFields":[{"name":"Tray Type","value":"Sieve"},{"name":"Tray Count","value":"20"}]},{"name":"Nozzles","customFields":[{"name":"Feed","value":"10 inch"},{"name":"Overhead","value":"8 inch"}]}]'::jsonb, CURRENT_DATE - 4),
  (v_project_id_6, 'Column', 'C-902', 'JOB-GAIL-7156-02', 'Depropanizer - 18 Tray', 'Depropanizer Column', '96" ID x 52'' T/T - 18 trays', 'SA-516 Gr.70', 'ASME VIII Div.1', 'documentation', 15, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'Datasheet Rev-01 approval', CURRENT_DATE + INTERVAL '24 days', 'high', 'Design Pressure', '185 psig', 'Design Temp', '450°F', 'MAWP', '200 psig', 'Trays', '18', 'Tray Type', 'Sieve', 'Corrosion Allowance', '3mm', 'Hydro Test', '278 psig', 'Operating Pressure', '150 psig', 'Depropanizer 96" ID. 18 sieve trays. Datasheet in preparation.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"98 inch"},{"name":"ID","value":"96 inch"},{"name":"Thickness","value":"14.3mm"}]},{"name":"Internals","customFields":[{"name":"Tray Type","value":"Sieve"},{"name":"Tray Count","value":"18"}]}]'::jsonb, CURRENT_DATE - 6),
  (v_project_id_6, 'Separator', 'V-901', 'JOB-GAIL-7156-03', 'HP Separator - 72 inch', 'HP Separator', '72" ID x 28'' T/T', 'SA-516 Gr.70', 'ASME VIII Div.1', 'in-progress', 45, 'fabrication', 'Vikram Sharma', 'Ramesh Patel', 'Anil Deshmukh', 'Gaurav Singh', 'Shop B', 'Shell weld NDT', CURRENT_DATE + INTERVAL '7 days', 'high', 'Design Pressure', '280 psig', 'Design Temp', '600°F', 'MAWP', '308 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '420 psig', 'Operating Pressure', '250 psig', 'Retention Time', '6 min', 'Demister', 'Yes', 'HP separator 72" ID. Shell rolling done. Fit-up in progress.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"74 inch"},{"name":"ID","value":"72 inch"},{"name":"Thickness","value":"12.7mm"},{"name":"Material","value":"SA-516 Gr.70"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"280 psig"},{"name":"MAWP","value":"308 psig"}]},{"name":"Internals","customFields":[{"name":"Demister","value":"Yes"}]}]'::jsonb, CURRENT_DATE - 2),
  (v_project_id_6, 'Separator', 'V-902', 'JOB-GAIL-7156-04', 'LP Flash Drum - 54 inch', 'LP Flash Drum', '54" ID x 22'' T/T', 'SA-516 Gr.70', 'ASME VIII Div.1', 'documentation', 28, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'Datasheet Rev-01 submission', CURRENT_DATE + INTERVAL '16 days', 'medium', 'Design Pressure', '95 psig', 'Design Temp', '450°F', 'MAWP', '105 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '142 psig', 'Operating Pressure', '75 psig', 'Retention Time', '5 min', 'Demister', 'Yes', 'LP flash drum 54" ID. Datasheet Rev-01 in progress.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"56 inch"},{"name":"ID","value":"54 inch"},{"name":"Thickness","value":"10.3mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"95 psig"}]}]'::jsonb, CURRENT_DATE - 5),
  (v_project_id_6, 'Heat Exchanger', 'E-901', 'JOB-GAIL-7156-05', 'Overhead Condenser', 'Overhead Condenser', '48" Shell x 24''', 'SA-516 Gr.70 / SA-179', 'ASME VIII Div.1, TEMA B', 'documentation', 22, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'Datasheet Rev-00 submission', CURRENT_DATE + INTERVAL '18 days', 'medium', 'Design Pressure Shell', '95 psig', 'Design Pressure Tube', '120 psig', 'Design Temp', '400°F', 'TEMA Class', 'B', 'Tube Count', '420', 'Baffle Cut', '20%', 'Hydro Test Shell', '142 psig', 'Hydro Test Tube', '180 psig', 'Overhead condenser 48" shell. Datasheet in preparation.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"50 inch"},{"name":"ID","value":"48 inch"},{"name":"Thickness","value":"10.3mm"}]},{"name":"Tube Bundle","customFields":[{"name":"Tube Count","value":"420"},{"name":"Material","value":"SA-179"}]}]'::jsonb, CURRENT_DATE - 7),
  (v_project_id_6, 'Heat Exchanger', 'E-902', 'JOB-GAIL-7156-06', 'Reboiler', 'Reboiler', '42" Shell x 22''', 'SA-516 Gr.70 / SA-213 T11', 'ASME VIII Div.1, TEMA B', 'pending', 10, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Pending', 'P&ID Rev-05 approval', CURRENT_DATE + INTERVAL '26 days', 'high', 'Design Pressure Shell', '200 psig', 'Design Pressure Tube', '250 psig', 'Design Temp', '550°F', 'TEMA Class', 'BEM', 'Tube Count', '380', 'Baffle Cut', '25%', 'Hydro Test Shell', '300 psig', 'Hydro Test Tube', '375 psig', 'Reboiler. Awaiting P&ID.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"44 inch"},{"name":"ID","value":"42 inch"},{"name":"Thickness","value":"12.7mm"}]},{"name":"Tube Bundle","customFields":[{"name":"Tube Count","value":"380"},{"name":"Material","value":"SA-213 T11"}]}]'::jsonb, CURRENT_DATE - 9),
  (v_project_id_6, 'Drum', 'D-901', 'JOB-GAIL-7156-07', 'Propane Drum - 48 inch', 'Propane Drum', '48" ID x 20'' T/T', 'SA-516 Gr.70', 'ASME VIII Div.1', 'documentation', 25, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'GA Rev-01 submission', CURRENT_DATE + INTERVAL '14 days', 'medium', 'Design Pressure', '125 psig', 'Design Temp', '350°F', 'MAWP', '138 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '187 psig', 'Operating Pressure', '95 psig', 'Liquid Level', '55%', 'Status', 'Documentation', 'Propane drum 48" ID. GA Rev-01 in progress.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"50 inch"},{"name":"ID","value":"48 inch"},{"name":"Thickness","value":"10.3mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"125 psig"}]}]'::jsonb, CURRENT_DATE - 6),
  (v_project_id_6, 'Drum', 'D-902', 'JOB-GAIL-7156-08', 'Butane Drum - 54 inch', 'Butane Drum', '54" ID x 22'' T/T', 'SA-516 Gr.70', 'ASME VIII Div.1', 'documentation', 22, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'GA Rev-00 submission', CURRENT_DATE + INTERVAL '18 days', 'medium', 'Design Pressure', '95 psig', 'Design Temp', '350°F', 'MAWP', '105 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '142 psig', 'Operating Pressure', '75 psig', 'Liquid Level', '50%', 'Status', 'Documentation', 'Butane drum 54" ID. GA Rev-00 in progress.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"56 inch"},{"name":"ID","value":"54 inch"},{"name":"Thickness","value":"10.3mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"95 psig"}]}]'::jsonb, CURRENT_DATE - 8);

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_6 LOOP INSERT INTO public.equipment_team_positions (equipment_id, position_name, person_name, email, phone, role) VALUES (v_equip_id, 'Project Manager', 'Gaurav Singh', 'gaurav.singh@company.com', '+91-98765-43200', 'editor'), (v_equip_id, 'VDCR Manager', 'Arun Nair', 'arun.nair@company.com', '+91-98765-43211', 'editor'), (v_equip_id, 'Supervisor', 'Vikram Sharma', 'vikram.sharma@company.com', '+91-98765-43212', 'editor'), (v_equip_id, 'Design Engineer', 'Priya Mehta', 'priya.mehta@company.com', '+91-98765-43210', 'editor'), (v_equip_id, 'Documentation Lead', 'Kavita Rao', 'kavita.rao@company.com', '+91-98765-43216', 'editor'), (v_equip_id, 'QC Inspector', 'Anil Deshmukh', 'anil.deshmukh@company.com', '+91-98765-43215', 'editor'); END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_6 AND tag_number = 'V-901' LOOP INSERT INTO public.equipment_team_positions (equipment_id, position_name, person_name, email, phone, role) VALUES (v_equip_id, 'Fabricator', 'Ramesh Patel', 'ramesh.patel@company.com', '+91-98765-43213', 'editor'), (v_equip_id, 'Welder', 'Suresh Kumar', 'suresh.kumar@company.com', '+91-98765-43214', 'editor'); END LOOP;

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_6 AND tag_number IN ('C-901','C-902','V-901','V-902','E-901','E-902','D-901','D-902') LOOP INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES (v_equip_id, 'Datasheet in preparation. Awaiting design inputs.', 'update'); END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_6 AND tag_number = 'V-901' LOOP INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES (v_equip_id, 'Shell rolling complete. Fit-up for longitudinal weld.', 'update'), (v_equip_id, 'Datasheet Rev-04 approved. Proceeding to fabrication.', 'milestone'); END LOOP;

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_6 LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) SELECT v_equip_id, d.n, d.u, d.t FROM (VALUES ('V-901-Datasheet-Rev04','https://storage.example.com/docs/GAIL-V-901-Datasheet.pdf','datasheet'),('V-901-Fabrication-Drawing-Rev05','https://storage.example.com/docs/GAIL-V-901-Fab-Drawing.pdf','drawing'),('V-901-MTR-Shell','https://storage.example.com/docs/GAIL-V-901-MTR-Shell.pdf','mtr'),('V-901-WPS-PQR','https://storage.example.com/docs/GAIL-V-901-WPS-PQR.pdf','wps'),('V-901-Test-Procedure','https://storage.example.com/docs/GAIL-V-901-Test-Procedure.pdf','procedure'),('V-901-Hydro-Test-Certificate','https://storage.example.com/docs/GAIL-V-901-Hydro-Test-Cert.pdf','certificate'),('V-901-Test-Certificate','https://storage.example.com/docs/GAIL-V-901-Test-Cert.pdf','certificate'),('V-901-NDT-Certificate','https://storage.example.com/docs/GAIL-V-901-NDT-Cert.pdf','certificate'),('V-901-Material-Test-Certificate','https://storage.example.com/docs/GAIL-V-901-MTC.pdf','certificate')) AS d(n,u,t) WHERE EXISTS (SELECT 1 FROM public.equipment e WHERE e.id = v_equip_id AND e.tag_number = 'V-901');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_6 AND tag_number IN ('C-901','C-902','V-902','E-901','E-902','D-901','D-902') LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES (v_equip_id, 'Datasheet-Rev00', 'https://storage.example.com/docs/GAIL-Datasheet.pdf', 'datasheet'), (v_equip_id, 'GA-Rev00', 'https://storage.example.com/docs/GAIL-GA.pdf', 'drawing'), (v_equip_id, 'Test-Procedure', 'https://storage.example.com/docs/GAIL-Test-Procedure.pdf', 'procedure'), (v_equip_id, 'Test-Certificate', 'https://storage.example.com/docs/GAIL-Test-Cert.pdf', 'certificate'), (v_equip_id, 'Hydro-Test-Certificate', 'https://storage.example.com/docs/GAIL-Hydro-Test-Cert.pdf', 'certificate'), (v_equip_id, 'Material-Test-Certificate', 'https://storage.example.com/docs/GAIL-MTC.pdf', 'certificate');
  END LOOP;

  INSERT INTO public.vdcr_records (project_id, firm_id, sr_no, equipment_tag_numbers, mfg_serial_numbers, job_numbers, client_doc_no, internal_doc_no, document_name, revision, code_status, status, department, remarks, project_documentation_start_date)
  VALUES (v_project_id_6, v_firm_id, '1', ARRAY['C-901'], ARRAY['Deethanizer - 20 Tray'], ARRAY['JOB-GAIL-7156-01'], 'GAIL-DOC-601', 'VDCR-7156-001', 'Datasheet', 'Rev-02', 'Code 1', 'received-for-comment', 'Mechanical', 'Tray spacing comments.', CURRENT_DATE - INTERVAL '6 days'), (v_project_id_6, v_firm_id, '2', ARRAY['V-901'], ARRAY['HP Separator - 72 inch'], ARRAY['JOB-GAIL-7156-03'], 'GAIL-DOC-602', 'VDCR-7156-002', 'Datasheet', 'Rev-04', 'Code 1', 'approved', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '42 days'), (v_project_id_6, v_firm_id, '3', ARRAY['V-901'], ARRAY['HP Separator - 72 inch'], ARRAY['JOB-GAIL-7156-03'], 'GAIL-DOC-603', 'VDCR-7156-003', 'Fabrication Drawing', 'Rev-05', 'Code 1', 'sent-for-approval', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '52 days'), (v_project_id_6, v_firm_id, '4', ARRAY['C-901','C-902','V-901','V-902'], ARRAY['Deethanizer - 20 Tray','Depropanizer - 18 Tray','HP Separator - 72 inch','LP Flash Drum - 54 inch'], ARRAY['JOB-GAIL-7156-01','JOB-GAIL-7156-02','JOB-GAIL-7156-03','JOB-GAIL-7156-04'], 'GAIL-DOC-604', 'VDCR-7156-004', 'Project P&ID', 'Rev-06', 'Code 1', 'approved', 'Process', NULL, CURRENT_DATE - INTERVAL '28 days');

  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id_6 LOOP
    FOR v_i IN 0..4 LOOP
      INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
      VALUES (v_vdcr_id, 'submitted', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (38 - v_i * 7), CURRENT_TIMESTAMP - INTERVAL '1 day' * (32 - v_i * 7), NULL, NULL, CASE WHEN v_i = 0 THEN 'Document sent.' WHEN v_i < 4 THEN 'Rev-' || LPAD((v_i)::text, 2, '0') || ' sent.' ELSE 'Final sent.' END, v_user_id), (v_vdcr_id, 'received', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (32 - v_i * 7), NULL, CURRENT_TIMESTAMP - INTERVAL '1 day' * (32 - v_i * 7), 6, CASE WHEN v_i < 4 THEN 'Received. Resubmit.' ELSE 'Received. Approved.' END, v_user_id);
    END LOOP;
  END LOOP;

  INSERT INTO public.project_members (project_id, name, email, position, role, status, user_id, equipment_assignments)
  VALUES (v_project_id_6, 'Gaurav Singh', 'gaurav.singh@company.com', 'Project Manager', 'project_manager', 'active', v_user_id, '["All Equipment"]'::jsonb), (v_project_id_6, 'Vikram Sharma', 'vikram.sharma@company.com', 'Fabrication Supervisor', 'editor', 'active', v_user_id, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_6 AND tag_number = 'V-901')), (v_project_id_6, 'Priya Mehta', 'priya.mehta@company.com', 'Design Engineer', 'editor', 'active', v_user_id, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_6 AND tag_number = ANY(ARRAY['C-901','C-902','V-902','E-901','E-902','D-901','D-902']))), (v_project_id_6, 'Arun Nair', 'arun.nair@company.com', 'VDCR Manager', 'vdcr_manager', 'active', v_user_id, '["All Equipment"]'::jsonb), (v_project_id_6, 'Ramesh Patel', 'ramesh.patel@company.com', 'Fabricator', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_6 AND tag_number = 'V-901')), (v_project_id_6, 'Anil Deshmukh', 'anil.deshmukh@company.com', 'QC Inspector', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_6)), (v_project_id_6, 'Kavita Rao', 'kavita.rao@company.com', 'Documentation Lead', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_6));

  UPDATE public.projects SET equipment_count = 8, active_equipment = 8 WHERE id = v_project_id_6;

  -- ========== 29. PROJECT 7: Reliance Jamnagar - Polypropylene Reactors (8 equip) ==========
  INSERT INTO public.projects (name, client, location, manager, deadline, po_number, firm_id, created_by, project_manager_id, vdcr_manager_id, scope_of_work, status, sales_order_date, client_industry, client_focal_point, tpi_agency, vdcr_manager, consultant, kickoff_meeting_notes, special_production_notes, services_included, equipment_count, active_equipment, progress)
  VALUES ('Reliance Jamnagar - Polypropylene Reactors', 'Reliance Industries Limited', 'Jamnagar Refinery, Gujarat', 'Gaurav Singh', CURRENT_DATE + INTERVAL '24 months', 'PO-RIL-2024-8192', v_firm_id, v_user_id, v_user_id, v_user_id, 'Supply of 8 pressure equipment for polypropylene unit: 2 reactors, 2 separators, 2 heat exchangers, 1 drum, 1 extrusion skid. ASME VIII Div.1. Full VDCR cycle.', 'active', CURRENT_DATE - INTERVAL '5 days', 'Petrochemicals', 'Kiran Shah - Lead Engineer', 'Bureau Veritas', 'Arun Nair', 'TÜV SÜD - Design Review', '- Kickoff 5 days ago. Loop reactor critical path.', '- SA-240 316L for reactors. Material lead 12 weeks.', '{"design": true, "testing": true, "documentation": true, "manufacturing": true}'::jsonb, 8, 8, 4)
  RETURNING id INTO v_project_id_7;

  INSERT INTO public.equipment (project_id, type, tag_number, job_number, manufacturing_serial, name, size, material, design_code, status, progress, progress_phase, supervisor, welder, qc_inspector, project_manager, location, next_milestone, next_milestone_date, priority, custom_field_1_name, custom_field_1_value, custom_field_2_name, custom_field_2_value, custom_field_3_name, custom_field_3_value, custom_field_4_name, custom_field_4_value, custom_field_5_name, custom_field_5_value, custom_field_6_name, custom_field_6_value, custom_field_7_name, custom_field_7_value, custom_field_8_name, custom_field_8_value, notes, created_by, technical_sections, last_update)
  VALUES
  (v_project_id_7, 'Reactor', 'R-1101', 'JOB-RIL-8192-01', 'Loop Reactor - 24 inch', 'Loop Reactor', '24" ID x 45'' T/T', 'SA-240 316L', 'ASME VIII Div.1', 'documentation', 15, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Design', 'Design calc Rev-02 approval', CURRENT_DATE + INTERVAL '22 days', 'high', 'Design Pressure', '580 psig', 'Design Temp', '185°F', 'MAWP', '638 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '870 psig', 'Operating Pressure', '450 psig', 'Catalyst', 'Ziegler-Natta', 'Lining', '316L', 'Loop reactor 24" ID. Design calc Rev-02 under review.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"26 inch"},{"name":"ID","value":"24 inch"},{"name":"Thickness","value":"12.7mm"},{"name":"Material","value":"SA-240 316L"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"580 psig"},{"name":"Design Temp","value":"185°F"}]},{"name":"Internals","customFields":[{"name":"Catalyst","value":"Ziegler-Natta"}]}]'::jsonb, CURRENT_DATE - 3),
  (v_project_id_7, 'Reactor', 'R-1102', 'JOB-RIL-8192-02', 'Flash Vessel - 36 inch', 'Flash Vessel', '36" ID x 18'' T/T', 'SA-240 316L', 'ASME VIII Div.1', 'documentation', 12, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'Datasheet Rev-00 submission', CURRENT_DATE + INTERVAL '26 days', 'high', 'Design Pressure', '95 psig', 'Design Temp', '250°F', 'MAWP', '105 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '142 psig', 'Operating Pressure', '75 psig', 'Retention Time', '4 min', 'Status', 'Design', 'Flash vessel 36" ID. Datasheet in preparation.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"38 inch"},{"name":"ID","value":"36 inch"},{"name":"Thickness","value":"8mm"},{"name":"Material","value":"SA-240 316L"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"95 psig"}]}]'::jsonb, CURRENT_DATE - 5),
  (v_project_id_7, 'Separator', 'V-1101', 'JOB-RIL-8192-03', 'Product Separator - 48 inch', 'Product Separator', '48" ID x 20'' T/T', 'SA-240 316L', 'ASME VIII Div.1', 'in-progress', 42, 'fabrication', 'Vikram Sharma', 'Ramesh Patel', 'Anil Deshmukh', 'Gaurav Singh', 'Shop A', 'Shell weld NDT', CURRENT_DATE + INTERVAL '8 days', 'high', 'Design Pressure', '85 psig', 'Design Temp', '350°F', 'MAWP', '95 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '127 psig', 'Operating Pressure', '65 psig', 'Retention Time', '5 min', 'Demister', 'Yes', 'Product separator 48" ID. Shell rolling done. SA-240 316L.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"50 inch"},{"name":"ID","value":"48 inch"},{"name":"Thickness","value":"9.5mm"},{"name":"Material","value":"SA-240 316L"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"85 psig"}]},{"name":"Internals","customFields":[{"name":"Demister","value":"Yes"}]}]'::jsonb, CURRENT_DATE - 2),
  (v_project_id_7, 'Separator', 'V-1102', 'JOB-RIL-8192-04', 'Catalyst Feed Drum - 36 inch', 'Catalyst Feed Drum', '36" ID x 16'' T/T', 'SA-240 316L', 'ASME VIII Div.1', 'documentation', 25, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'Datasheet Rev-01 approval', CURRENT_DATE + INTERVAL '16 days', 'medium', 'Design Pressure', '95 psig', 'Design Temp', '250°F', 'MAWP', '105 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '142 psig', 'Operating Pressure', '75 psig', 'Liquid Level', '50%', 'Status', 'Documentation', 'Catalyst feed drum 36" ID. Datasheet under review.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"38 inch"},{"name":"ID","value":"36 inch"},{"name":"Thickness","value":"8mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"95 psig"}]}]'::jsonb, CURRENT_DATE - 6),
  (v_project_id_7, 'Heat Exchanger', 'E-1101', 'JOB-RIL-8192-05', 'Cooling Exchanger', 'Cooling Exchanger', '42" Shell x 22''', 'SA-240 316L / SA-213 316L', 'ASME VIII Div.1, TEMA B', 'pending', 10, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Pending', 'P&ID Rev-04 approval', CURRENT_DATE + INTERVAL '24 days', 'high', 'Design Pressure Shell', '120 psig', 'Design Pressure Tube', '150 psig', 'Design Temp', '350°F', 'TEMA Class', 'BEM', 'Tube Count', '360', 'Baffle Cut', '25%', 'Hydro Test Shell', '180 psig', 'Hydro Test Tube', '225 psig', 'Cooling exchanger. Awaiting P&ID.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"44 inch"},{"name":"ID","value":"42 inch"},{"name":"Thickness","value":"10.3mm"},{"name":"Material","value":"SA-240 316L"}]},{"name":"Tube Bundle","customFields":[{"name":"Tube Count","value":"360"},{"name":"Material","value":"SA-213 316L"}]}]'::jsonb, CURRENT_DATE - 8),
  (v_project_id_7, 'Heat Exchanger', 'E-1102', 'JOB-RIL-8192-06', 'Condenser', 'Condenser', '36" Shell x 18''', 'SA-240 316L / SA-179', 'ASME VIII Div.1, TEMA B', 'documentation', 20, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'Datasheet Rev-00 submission', CURRENT_DATE + INTERVAL '20 days', 'medium', 'Design Pressure Shell', '75 psig', 'Design Pressure Tube', '100 psig', 'Design Temp', '300°F', 'TEMA Class', 'B', 'Tube Count', '280', 'Baffle Cut', '20%', 'Hydro Test Shell', '112 psig', 'Hydro Test Tube', '150 psig', 'Condenser. Datasheet in preparation.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"38 inch"},{"name":"ID","value":"36 inch"},{"name":"Thickness","value":"9.5mm"}]},{"name":"Tube Bundle","customFields":[{"name":"Tube Count","value":"280"},{"name":"Material","value":"SA-179"}]}]'::jsonb, CURRENT_DATE - 7),
  (v_project_id_7, 'Drum', 'D-1101', 'JOB-RIL-8192-07', 'Buffer Drum - 42 inch', 'Buffer Drum', '42" ID x 18'' T/T', 'SA-240 316L', 'ASME VIII Div.1', 'documentation', 22, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Documentation', 'GA Rev-01 submission', CURRENT_DATE + INTERVAL '18 days', 'medium', 'Design Pressure', '65 psig', 'Design Temp', '250°F', 'MAWP', '72 psig', 'Corrosion Allowance', '3mm', 'Hydro Test', '97 psig', 'Operating Pressure', '52 psig', 'Liquid Level', '55%', 'Status', 'Documentation', 'Buffer drum 42" ID. GA Rev-01 in progress.', v_user_id, '[{"name":"Outer Shell","customFields":[{"name":"OD","value":"44 inch"},{"name":"ID","value":"42 inch"},{"name":"Thickness","value":"8mm"}]},{"name":"Heads","customFields":[{"name":"Type","value":"2:1 SE"}]},{"name":"Design Parameters","customFields":[{"name":"Design Pressure","value":"65 psig"}]}]'::jsonb, CURRENT_DATE - 6),
  (v_project_id_7, 'Skid', 'S-1101', 'JOB-RIL-8192-08', 'Extrusion Skid', 'Extrusion Skid', '16'' x 12'' x 10'' base', 'SS316L base & extruder', 'ASME B31.3', 'pending', 5, 'documentation', 'Vikram Sharma', NULL, 'Anil Deshmukh', 'Gaurav Singh', 'Pending', 'P&ID & GA approval', CURRENT_DATE + INTERVAL '32 days', 'low', 'Design Pressure', '95 psig', 'Design Temp', '450°F', 'Extruder Type', 'Twin-screw', 'Material', 'SS316L', 'Base', 'SS316L', 'Piping', 'B31.3', 'Hydro Test', '142 psig', 'Status', 'Design', 'Extrusion skid. Awaiting P&ID.', v_user_id, '[{"name":"Extruder","customFields":[{"name":"Type","value":"Twin-screw"},{"name":"Material","value":"SS316L"}]},{"name":"Skid Base","customFields":[{"name":"Material","value":"SS316L"},{"name":"Dimensions","value":"16'' x 12'' x 10''"}]}]'::jsonb, CURRENT_DATE - 10);

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_7 LOOP INSERT INTO public.equipment_team_positions (equipment_id, position_name, person_name, email, phone, role) VALUES (v_equip_id, 'Project Manager', 'Gaurav Singh', 'gaurav.singh@company.com', '+91-98765-43200', 'editor'), (v_equip_id, 'VDCR Manager', 'Arun Nair', 'arun.nair@company.com', '+91-98765-43211', 'editor'), (v_equip_id, 'Supervisor', 'Vikram Sharma', 'vikram.sharma@company.com', '+91-98765-43212', 'editor'), (v_equip_id, 'Design Engineer', 'Priya Mehta', 'priya.mehta@company.com', '+91-98765-43210', 'editor'), (v_equip_id, 'Documentation Lead', 'Kavita Rao', 'kavita.rao@company.com', '+91-98765-43216', 'editor'), (v_equip_id, 'QC Inspector', 'Anil Deshmukh', 'anil.deshmukh@company.com', '+91-98765-43215', 'editor'); END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_7 AND tag_number = 'V-1101' LOOP INSERT INTO public.equipment_team_positions (equipment_id, position_name, person_name, email, phone, role) VALUES (v_equip_id, 'Fabricator', 'Ramesh Patel', 'ramesh.patel@company.com', '+91-98765-43213', 'editor'), (v_equip_id, 'Welder', 'Suresh Kumar', 'suresh.kumar@company.com', '+91-98765-43214', 'editor'); END LOOP;

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_7 AND tag_number IN ('R-1101','R-1102','V-1101','V-1102','E-1101','E-1102','D-1101','S-1101') LOOP INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES (v_equip_id, 'Datasheet in preparation. Awaiting design inputs.', 'update'); END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_7 AND tag_number = 'V-1101' LOOP INSERT INTO public.equipment_progress_entries (equipment_id, entry_text, entry_type) VALUES (v_equip_id, 'Shell rolling complete. Fit-up for longitudinal weld.', 'update'), (v_equip_id, 'Datasheet Rev-03 approved. Proceeding to fabrication.', 'milestone'); END LOOP;

  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_7 LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) SELECT v_equip_id, d.n, d.u, d.t FROM (VALUES ('V-1101-Datasheet-Rev03','https://storage.example.com/docs/RIL-V-1101-Datasheet.pdf','datasheet'),('V-1101-Fabrication-Drawing-Rev04','https://storage.example.com/docs/RIL-V-1101-Fab-Drawing.pdf','drawing'),('V-1101-MTR-Shell','https://storage.example.com/docs/RIL-V-1101-MTR-Shell.pdf','mtr'),('V-1101-WPS-PQR','https://storage.example.com/docs/RIL-V-1101-WPS-PQR.pdf','wps'),('V-1101-Test-Procedure','https://storage.example.com/docs/RIL-V-1101-Test-Procedure.pdf','procedure'),('V-1101-Hydro-Test-Certificate','https://storage.example.com/docs/RIL-V-1101-Hydro-Test-Cert.pdf','certificate'),('V-1101-Test-Certificate','https://storage.example.com/docs/RIL-V-1101-Test-Cert.pdf','certificate'),('V-1101-NDT-Certificate','https://storage.example.com/docs/RIL-V-1101-NDT-Cert.pdf','certificate'),('V-1101-Material-Test-Certificate','https://storage.example.com/docs/RIL-V-1101-MTC.pdf','certificate')) AS d(n,u,t) WHERE EXISTS (SELECT 1 FROM public.equipment e WHERE e.id = v_equip_id AND e.tag_number = 'V-1101');
  END LOOP;
  FOR v_equip_id IN SELECT id FROM public.equipment WHERE project_id = v_project_id_7 AND tag_number IN ('R-1101','R-1102','V-1102','E-1101','E-1102','D-1101','S-1101') LOOP
    INSERT INTO public.equipment_documents (equipment_id, document_name, document_url, document_type) VALUES (v_equip_id, 'Design-Calculation', 'https://storage.example.com/docs/RIL-Design-Calc.pdf', 'calculation'), (v_equip_id, 'Datasheet-Rev00', 'https://storage.example.com/docs/RIL-Datasheet.pdf', 'datasheet'), (v_equip_id, 'GA-Rev00', 'https://storage.example.com/docs/RIL-GA.pdf', 'drawing'), (v_equip_id, 'Test-Procedure', 'https://storage.example.com/docs/RIL-Test-Procedure.pdf', 'procedure'), (v_equip_id, 'Test-Certificate', 'https://storage.example.com/docs/RIL-Test-Cert.pdf', 'certificate'), (v_equip_id, 'Hydro-Test-Certificate', 'https://storage.example.com/docs/RIL-Hydro-Test-Cert.pdf', 'certificate'), (v_equip_id, 'Material-Test-Certificate', 'https://storage.example.com/docs/RIL-MTC.pdf', 'certificate');
  END LOOP;

  INSERT INTO public.vdcr_records (project_id, firm_id, sr_no, equipment_tag_numbers, mfg_serial_numbers, job_numbers, client_doc_no, internal_doc_no, document_name, revision, code_status, status, department, remarks, project_documentation_start_date)
  VALUES (v_project_id_7, v_firm_id, '1', ARRAY['R-1101'], ARRAY['Loop Reactor - 24 inch'], ARRAY['JOB-RIL-8192-01'], 'RIL-DOC-701', 'VDCR-8192-001', 'Design Calculation', 'Rev-02', 'Code 1', 'received-for-comment', 'Mechanical', 'Revise wall thickness.', CURRENT_DATE - INTERVAL '4 days'), (v_project_id_7, v_firm_id, '2', ARRAY['V-1101'], ARRAY['Product Separator - 48 inch'], ARRAY['JOB-RIL-8192-03'], 'RIL-DOC-702', 'VDCR-8192-002', 'Datasheet', 'Rev-03', 'Code 1', 'approved', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '40 days'), (v_project_id_7, v_firm_id, '3', ARRAY['V-1101'], ARRAY['Product Separator - 48 inch'], ARRAY['JOB-RIL-8192-03'], 'RIL-DOC-703', 'VDCR-8192-003', 'Fabrication Drawing', 'Rev-04', 'Code 1', 'sent-for-approval', 'Mechanical', NULL, CURRENT_DATE - INTERVAL '50 days'), (v_project_id_7, v_firm_id, '4', ARRAY['R-1101','R-1102','V-1101','V-1102'], ARRAY['Loop Reactor - 24 inch','Flash Vessel - 36 inch','Product Separator - 48 inch','Catalyst Feed Drum - 36 inch'], ARRAY['JOB-RIL-8192-01','JOB-RIL-8192-02','JOB-RIL-8192-03','JOB-RIL-8192-04'], 'RIL-DOC-704', 'VDCR-8192-004', 'Project P&ID', 'Rev-05', 'Code 1', 'approved', 'Process', NULL, CURRENT_DATE - INTERVAL '25 days');

  FOR v_vdcr_id IN SELECT id FROM public.vdcr_records WHERE project_id = v_project_id_7 LOOP
    FOR v_i IN 0..4 LOOP
      INSERT INTO public.vdcr_revision_events (vdcr_record_id, event_type, revision_number, event_date, estimated_return_date, actual_return_date, days_elapsed, notes, created_by)
      VALUES (v_vdcr_id, 'submitted', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (36 - v_i * 7), CURRENT_TIMESTAMP - INTERVAL '1 day' * (30 - v_i * 7), NULL, NULL, CASE WHEN v_i = 0 THEN 'Document sent.' WHEN v_i < 4 THEN 'Rev-' || LPAD((v_i)::text, 2, '0') || ' sent.' ELSE 'Final sent.' END, v_user_id), (v_vdcr_id, 'received', 'Rev-' || LPAD((v_i)::text, 2, '0'), CURRENT_TIMESTAMP - INTERVAL '1 day' * (30 - v_i * 7), NULL, CURRENT_TIMESTAMP - INTERVAL '1 day' * (30 - v_i * 7), 6, CASE WHEN v_i < 4 THEN 'Received. Resubmit.' ELSE 'Received. Approved.' END, v_user_id);
    END LOOP;
  END LOOP;

  INSERT INTO public.project_members (project_id, name, email, position, role, status, user_id, equipment_assignments)
  VALUES (v_project_id_7, 'Gaurav Singh', 'gaurav.singh@company.com', 'Project Manager', 'project_manager', 'active', v_user_id, '["All Equipment"]'::jsonb), (v_project_id_7, 'Vikram Sharma', 'vikram.sharma@company.com', 'Fabrication Supervisor', 'editor', 'active', v_user_id, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_7 AND tag_number = 'V-1101')), (v_project_id_7, 'Priya Mehta', 'priya.mehta@company.com', 'Design Engineer', 'editor', 'active', v_user_id, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_7 AND tag_number = ANY(ARRAY['R-1101','R-1102','V-1102','E-1101','E-1102','D-1101','S-1101']))), (v_project_id_7, 'Arun Nair', 'arun.nair@company.com', 'VDCR Manager', 'vdcr_manager', 'active', v_user_id, '["All Equipment"]'::jsonb), (v_project_id_7, 'Ramesh Patel', 'ramesh.patel@company.com', 'Fabricator', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_7 AND tag_number = 'V-1101')), (v_project_id_7, 'Anil Deshmukh', 'anil.deshmukh@company.com', 'QC Inspector', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_7)), (v_project_id_7, 'Kavita Rao', 'kavita.rao@company.com', 'Documentation Lead', 'editor', 'active', NULL, (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.equipment WHERE project_id = v_project_id_7));

  UPDATE public.projects SET equipment_count = 8, active_equipment = 8 WHERE id = v_project_id_7;

  RAISE NOTICE 'Seed complete. 7 Projects, 55 equipments. P1: HPCL Mumbai 10, P2: IOCL Vadodara 6, P3: BPCL Kochi 8, P4: MRPL Mangalore 7, P5: ONGC Dahej 8, P6: GAIL Pata 8, P7: Reliance Jamnagar 8. All with full technical_sections, documents, equipment_assignments.';
END $$;
