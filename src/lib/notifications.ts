// =====================================================
// NOTIFICATION SERVICE - EMAIL & WHATSAPP
// =====================================================

import axios from "axios";

interface NotificationData {
  company_name: string;
  admin_name: string;
  admin_email: string;
  admin_phone?: string;
  admin_whatsapp?: string;
  role: string;
  dashboard_url: string;
}

// Email service using EmailJS (free and easy)
export const sendEmailNotification = async (data: NotificationData) => {
  try {
    // // console.log('📧 Sending email notification to:', data.admin_email);
    
    // Check if EmailJS credentials are set
    const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
    const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
    const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
    
    // Debug: Log the actual values
    // // console.log('🔍 EmailJS Debug - Service ID:', serviceId);
    // // console.log('🔍 EmailJS Debug - Template ID:', templateId);
    // // console.log('🔍 EmailJS Debug - Public Key:', publicKey);
    
    if (!serviceId || !templateId || !publicKey || 
        serviceId === 'your_service_id' || 
        templateId === 'your_template_id' || 
        publicKey === 'your_public_key') {
      // // console.log('⚠️ EmailJS credentials not set, skipping email');
      return { success: true, message: 'EmailJS credentials not configured' };
    }
    
    // EmailJS template parameters (must match your template exactly)
    const templateParams = {
      to_name: data.admin_name,
      to_email: data.admin_email,
      company_name: data.company_name,
      role: data.role,
      project_name: '', // Empty for company admin emails
      login_url: data.dashboard_url, // This will be the signup page URL
      signup_url: data.dashboard_url, // Alternative name for signup URL
      dashboard_url: data.dashboard_url, // Keep for backward compatibility
      message: `Hi ${data.admin_name},

Welcome to ${data.company_name}!

Your account has been created with the role: ${data.role}

Access your dashboard here: ${data.dashboard_url}

Login with your email: ${data.admin_email}

Best regards,
Engineering Project Management Team`
    };

    // Ensure email is properly formatted
    if (!templateParams.to_email || templateParams.to_email.trim() === '') {
      // // console.log('❌ Email address is empty or invalid');
      return { success: false, message: 'Email address is empty or invalid' };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(templateParams.to_email)) {
      // // console.log('❌ Invalid email format:', templateParams.to_email);
      return { success: false, message: `Invalid email format: ${templateParams.to_email}` };
    }

    // Debug: Check if email is properly set
    // // console.log('📧 Template params debug:', {
    //   to_name: templateParams.to_name,
    //   to_email: templateParams.to_email,
    //   company_name: templateParams.company_name,
    //   role: templateParams.role,
    //   dashboard_url: templateParams.dashboard_url
    // });

    // // console.log('📧 EmailJS params:', {
    //   service_id: serviceId,
    //   template_id: templateId,
    //   user_id: publicKey,
    //   template_params: templateParams
    // });

    // EmailJS API call using axios
    const response = await axios.post('https://api.emailjs.com/api/v1.0/email/send', {
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: templateParams
    }, {
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const responseText = response.data;
    // // console.log('📧 EmailJS response:', response.status, responseText);

    if (response.status === 200) {
      // // console.log('✅ Email sent successfully');
      return { success: true, message: 'Email sent successfully' };
    } else {
      // // console.log('❌ Email sending failed:', response.status, responseText);
      return { success: false, message: `Email failed: ${response.status} - ${responseText}` };
    }
  } catch (error) {
    // console.error('❌ Email error:', error);
    return { success: false, message: `Email service error: ${error}` };
  }
};

// WhatsApp service using WhatsApp Business API
export const sendWhatsAppNotification = async (data: NotificationData) => {
  try {
    if (!data.admin_whatsapp) {
      // // console.log('📱 No WhatsApp number provided, skipping');
      return { success: true, message: 'No WhatsApp number provided' };
    }

    // // console.log('📱 Sending WhatsApp notification to:', data.admin_whatsapp);
    
    const message = `🎉 Welcome to ${data.company_name}!

Hi ${data.admin_name},

Your account is ready!
Role: ${data.role}

🔗 Access Dashboard: ${data.dashboard_url}

📧 Login Email: ${data.admin_email}

Best regards,
Engineering Project Management`;

    // Using WhatsApp Business Cloud API
    const whatsappData = {
      messaging_product: "whatsapp",
      to: data.admin_whatsapp,
      type: "text",
      text: {
        body: message
      }
    };

    const response = await axios.post(`https://graph.facebook.com/v18.0/${import.meta.env.VITE_WHATSAPP_PHONE_ID}/messages`, whatsappData, {
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      }
    });

    if (response.status === 200) {
      // // console.log('✅ WhatsApp sent successfully');
      return { success: true, message: 'WhatsApp sent successfully' };
    } else {
      // // console.log('❌ WhatsApp sending failed');
      return { success: false, message: 'WhatsApp sending failed' };
    }
  } catch (error) {
    console.error('❌ WhatsApp error:', error);
    return { success: false, message: 'WhatsApp service error' };
  }
};

// Main notification function
export const sendNotifications = async (data: NotificationData) => {
  // // console.log('🚀 Sending notifications for:', data.company_name);
  
  try {
    // For now, send only email (WhatsApp setup is complex)
    const emailResult = await sendEmailNotification(data);

    const results = {
      email: emailResult,
      whatsapp: { success: true, message: 'WhatsApp setup pending - will add later' }
    };

    // // console.log('📊 Notification results:', results);
    
    return {
      success: true,
      results: results,
      message: 'Email notification sent successfully'
    };
  } catch (error) {
    console.error('❌ Notification service error:', error);
    return {
      success: false,
      message: 'Notification service error',
      error: error
    };
  }
};

// Helper function to get signup URL (for email notifications)
export const getDashboardUrl = (role: string): string => {
  const baseUrl = window.location.origin;
  
  // Return signup page URL for new users
  // This way users can create their account first, then login
  return `${baseUrl}/signup`;
};

// Project team notification interface
interface ProjectTeamNotificationData {
  project_name: string;
  team_member_name: string;
  team_member_email: string;
  role: string;
  company_name: string;
  dashboard_url: string;
  equipment_name?: string;
}

// Send email notification to project team members
export const sendProjectTeamEmailNotification = async (data: ProjectTeamNotificationData) => {
  try {
    // // console.log('📧 Sending project team email notification to:', data.team_member_email);
    // // console.log('📧 Full notification data:', data);
    
    // Check if EmailJS credentials are set
    const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
    const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
    const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
    
    // Debug: Log the actual values
    // // console.log('🔍 Project Team EmailJS Debug - Service ID:', serviceId);
    // // console.log('🔍 Project Team EmailJS Debug - Template ID:', templateId);
    // // console.log('🔍 Project Team EmailJS Debug - Public Key:', publicKey);
    
    if (!serviceId || !templateId || !publicKey || 
        serviceId === 'your_service_id' || 
        templateId === 'your_template_id' || 
        publicKey === 'your_public_key') {
      // // console.log('⚠️ EmailJS credentials not set, skipping email');
      return { success: true, message: 'EmailJS credentials not configured' };
    }
    
    // EmailJS template parameters for project team members
    const templateParams = {
      to_name: data.team_member_name,
      to_email: data.team_member_email,
      company_name: data.company_name,
      role: data.role,
      project_name: data.project_name,
      equipment_name: data.equipment_name || '',
      login_url: data.dashboard_url,
      signup_url: data.dashboard_url,
      dashboard_url: data.dashboard_url,
      message: `Hi ${data.team_member_name},

You have been assigned as ${data.role} for the project: ${data.project_name}

Company: ${data.company_name}

Access your dashboard here: ${data.dashboard_url}

Login with your email: ${data.team_member_email}

Best regards,
Engineering Project Management Team`
    };

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(templateParams.to_email)) {
      // // console.log('❌ Invalid email format:', templateParams.to_email);
      return { success: false, message: `Invalid email format: ${templateParams.to_email}` };
    }

    // // console.log('📧 Project team email params:', {
    //   to_name: templateParams.to_name,
    //   to_email: templateParams.to_email,
    //   project_name: templateParams.project_name,
    //   role: templateParams.role
    // });

    // EmailJS API call using axios
    const response = await axios.post('https://api.emailjs.com/api/v1.0/email/send', {
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: templateParams
    }, {
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const responseText = response.data;
    // // console.log('📧 Project team email response:', response.status, responseText);

    if (response.status === 200) {
      // // console.log('✅ Project team email sent successfully');
      return { success: true, message: 'Email sent successfully' };
    } else {
      // // console.log('❌ Project team email sending failed:', response.status, responseText);
      return { success: false, message: `Email failed: ${response.status} - ${responseText}` };
    }
  } catch (error) {
    console.error('❌ Project team email error:', error);
    return { success: false, message: `Email service error: ${error}` };
  }
};

// Send notifications to project team members
export const sendProjectTeamNotifications = async (data: ProjectTeamNotificationData) => {
  // // console.log('🚀 Sending project team notifications for:', data.project_name);
  
  try {
    const emailResult = await sendProjectTeamEmailNotification(data);

    // // console.log('📊 Project team notification results:', emailResult);
    
    return {
      success: true,
      results: emailResult,
      message: 'Project team email notification sent successfully'
    };
  } catch (error) {
    console.error('❌ Project team notification service error:', error);
    return {
      success: false,
      message: 'Project team notification service error',
      error: error
    };
  }
};
