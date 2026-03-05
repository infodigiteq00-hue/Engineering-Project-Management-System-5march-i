import { supabase } from './supabase'
import { DatabaseService } from './database'

// Migration utility to move from mock data to real database
export class DataMigration {
  // Create a demo firm and migrate existing data
  static async migrateMockData() {
    try {
      // // console.log('🚀 Starting data migration...')

      // 1. First, let's check if we have an authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        // // console.log('⚠️ No authenticated user found, creating demo user...')
        
        // Create a demo user account
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: 'demo@demoengineering.com',
          password: 'demo123456',
          options: {
            data: {
              full_name: 'Demo User',
              role: 'firm_admin'
            }
          }
        })
        
        if (signUpError) {
          // // console.log('⚠️ User creation failed:', signUpError.message)
          // Continue without user for now
        } else {
          // console.log('✅ Demo user created')
        }
      }

      // 2. Create demo firm (this should work now)
      const firm = await DatabaseService.createFirm({
        name: 'Demo Engineering Co.',
        subscription_plan: 'premium'
      })
      // // console.log('✅ Firm created:', firm.name)

      // 3. Migrate existing mock projects
      const mockProjects = [
        {
          name: "Hazira Plant Project",
          client: "Reliance Industries",
          location: "Hazira, Gujarat",
          equipment_count: 24,
          active_equipment: 18,
          progress: 75,
          status: "active" as const,
          manager: "Rajesh Kumar",
          deadline: "2025-12-15",
          po_number: "REL-2024-HE-001",
          firm_id: firm.id,
          scope_of_work: "Industrial equipment manufacturing project for chemical processing facility. Equipment includes various types of vessels and heat exchangers designed for high-pressure and high-temperature applications."
        },
        {
          name: "UPL Plant 5 Project",
          client: "UPL Limited",
          location: "Ankleshwar, Gujarat",
          equipment_count: 16,
          active_equipment: 12,
          progress: 60,
          status: "delayed" as const,
          manager: "Priya Sharma",
          deadline: "2025-11-20",
          po_number: "UPL-2024-PV-003",
          firm_id: firm.id,
          scope_of_work: "Pressure vessel manufacturing and installation project for chemical processing plant expansion."
        },
        {
          name: "IOCL Refinery Expansion",
          client: "Indian Oil Corporation",
          location: "Panipat, Haryana",
          equipment_count: 32,
          active_equipment: 28,
          progress: 90,
          status: "on-track" as const,
          manager: "Amit Patel",
          deadline: "2026-04-01",
          po_number: "IOCL-2024-RP-007",
          firm_id: firm.id,
          scope_of_work: "Comprehensive refinery expansion project including reactor vessels, heat exchangers, and storage systems with full commissioning services."
        },
        {
          name: "BPCL Petrochemical Plant",
          client: "BPCL",
          location: "Mumbai, Maharashtra",
          equipment_count: 18,
          active_equipment: 15,
          progress: 85,
          status: "active" as const,
          manager: "Vikram Singh",
          deadline: "2027-06-01",
          po_number: "BPCL-2024-PP-012",
          firm_id: firm.id
        }
      ]

      const createdProjects = []
      for (const projectData of mockProjects) {
        try {
          const project = await DatabaseService.createProject(projectData)
          createdProjects.push(project)
          // // console.log(`✅ Project created: ${project.name}`)
        } catch (error) {
          // console.log(`⚠️ Project creation failed for ${projectData.name}:`, error)
        }
      }

      // 4. Migrate existing mock equipment
      const mockEquipment = [
        {
          project_id: createdProjects[0]?.id, // Hazira Plant Project
          type: "Pressure Vessel",
          tag_number: "PV-001",
          job_number: "JOB-2024-001",
          manufacturing_serial: "PV-001-2024-REL",
          po_cdd: "Dec 25, 2025",
          status: "on-track" as const,
          progress: 85,
          progress_phase: "testing" as const,
          location: "Shop Floor A",
          supervisor: "Manoj Singh",
          last_update: new Date().toISOString(),
          next_milestone: "Final Inspection - Nov 25",
          priority: "high" as const,
          is_basic_info: false,
          size: "3.2m x 2.1m",
          weight: "2,850 kg",
          design_code: "ASME VIII Div 1",
          material: "SS 316L",
          working_pressure: "25 bar",
          design_temp: "350°C",
          welder: "Rajesh Patel",
          qc_inspector: "Priya Sharma",
          project_manager: "Amit Kumar"
        },
        {
          project_id: createdProjects[0]?.id, // Hazira Plant Project
          type: "Heat Exchanger",
          tag_number: "HE-002",
          job_number: "JOB-2024-002",
          manufacturing_serial: "HE-002-2024-REL",
          po_cdd: "October 2025",
          status: "delayed" as const,
          progress: 45,
          progress_phase: "manufacturing" as const,
          location: "Shop Floor B",
          supervisor: "Sunita Rao",
          last_update: new Date().toISOString(),
          next_milestone: "Welding Complete - Dec 5",
          priority: "high" as const,
          is_basic_info: false,
          size: "4.5m x 1.8m",
          weight: "1,950 kg",
          design_code: "TEMA Class R",
          material: "Carbon Steel",
          working_pressure: "18 bar",
          design_temp: "280°C",
          welder: "Vikram Singh",
          qc_inspector: "Anita Desai",
          project_manager: "Rajesh Kumar"
        },
        {
          project_id: createdProjects[1]?.id, // UPL Plant 5 Project
          type: "Storage Tank",
          tag_number: "ST-003",
          job_number: "JOB-2024-003",
          manufacturing_serial: "ST-003-2024-REL",
          po_cdd: "Aug 8, 2025",
          status: "on-track" as const,
          progress: 70,
          progress_phase: "manufacturing" as const,
          location: "Assembly Area",
          supervisor: "Vikram Joshi",
          last_update: new Date().toISOString(),
          next_milestone: "Quality Check - Nov 28",
          priority: "medium" as const,
          is_basic_info: false,
          size: "6.0m x 3.5m",
          weight: "4,200 kg",
          design_code: "API 650",
          material: "SS 304",
          working_pressure: "12 bar",
          design_temp: "200°C",
          welder: "Suresh Kumar",
          qc_inspector: "Meera Patel",
          project_manager: "Priya Sharma"
        }
      ]

      const createdEquipment = []
      for (const equipmentData of mockEquipment) {
        if (equipmentData.project_id) {
          try {
            const equipment = await DatabaseService.createEquipment(equipmentData)
            createdEquipment.push(equipment)
            // // console.log(`✅ Equipment created: ${equipment.type} ${equipment.tag_number}`)
          } catch (error) {
            // console.log(`⚠️ Equipment creation failed for ${equipmentData.tag_number}:`, error)
          }
        }
      }

      // 5. Create sample progress entries
      for (const equipment of createdEquipment) {
        const progressEntries = [
          { text: "Material cutting completed", date: "Nov 20, 2024", type: "material" },
          { text: "Welding started on main shell", date: "Nov 22, 2024", type: "welding" },
          { text: "Quality inspection passed", date: "Nov 23, 2024", type: "inspection" }
        ]

        for (const entry of progressEntries) {
          try {
            await DatabaseService.createProgressEntry({
              equipment_id: equipment.id,
              ...entry
            })
          } catch (error) {
            // console.log(`⚠️ Progress entry creation failed:`, error)
          }
        }
      }

      // 6. Create sample team positions
      for (const equipment of createdEquipment) {
        const teamPositions = [
          { position: "Welder", name: "Rajesh Patel" },
          { position: "QC Inspector", name: "Priya Sharma" }
        ]

        for (const position of teamPositions) {
          try {
            await DatabaseService.createTeamPosition({
              equipment_id: equipment.id,
              ...position
            })
          } catch (error) {
            // console.log(`⚠️ Team position creation failed:`, error)
          }
        }
      }

      // // console.log('🎉 Data migration completed successfully!')
      // // console.log(`📊 Created: ${createdProjects.length} projects, ${createdEquipment.length} equipment items`)
      
      return {
        firm,
        projects: createdProjects,
        equipment: createdEquipment
      }

    } catch (error) {
      console.error('❌ Migration failed:', error)
      throw error
    }
  }

  // Check if migration is needed
  static async checkMigrationStatus() {
    try {
      const { data: projects, error } = await supabase
        .from('projects')
        .select('id')
        .limit(1)

      if (error) throw error
      
      return {
        needsMigration: projects.length === 0,
        existingData: projects.length > 0
      }
    } catch (error) {
      // // console.log('Database not ready, migration needed')
      return {
        needsMigration: true,
        existingData: false
      }
    }
  }
}

export default DataMigration
