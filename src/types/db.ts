export interface ActivityLogs {
  id: string;
  user_id: string | null;
  action: string | null;
  entity: string | null;
  details: string | null;
  created_at: string | null;
}

export interface AnnouncementScopes {
  id: string;
  announcement_id: string | null;
  unit_id: string | null;
}

export interface Announcements {
  id: string;
  property_id: string | null;
  created_by: string | null;
  body: string | null;
  created_at: string | null;
}

export interface LandlordVerification {
  id: string;
  user_id: string | null;
  id_type: string | null;
  id_number: string | null;
  id_document_url: string | null;
  ownership_proof_url: string | null;
  stamp_url: string | null;
  signature_url: string | null;
  status: string | null;
  verified_at: string | null;
}

export interface MaintenanceRequests {
  id: string;
  tenant_id: string | null;
  property_id: string | null;
  title: string | null;
  description: string | null;
  urgency: string | null;
  status: string | null;
  created_at: string | null;
  resolved_at: string | null;
}

export interface Messages {
  id: string;
  sender_id: string | null;
  receiver_id: string | null;
  message_body: string | null;
  status: string | null;
  created_at: string | null;
}

export interface MoveOutRequests {
  id: string;
  tenant_id: string | null;
  unit_id: string | null;
  property_id: string | null;
  requested_by: string | null;
  reason: string | null;
  proposed_date: string | null;
  status: string | null;
  tenant_response: string | null;
  created_at: string | null;
  resolved_at: string | null;
}

export interface Notifications {
  id: string;
  user_id: string | null;
  title: string | null;
  body: string | null;
  is_read: boolean | null;
  created_at: string | null;
  event_type: string | null;
  reference_id: string | null;
}

export interface Payments {
  id: string;
  tenant_id: string | null;
  property_id: string | null;
  amount: number | null;
  reference: string | null;
  payment_method: string | null;
  status: string | null;
  paid_at: string | null;
}

export interface Properties {
  id: string;
  owner_id: string | null;
  property_code: string | null;
  name: string | null;
  address: string | null;
  type: string | null;
  receipt_serial_counter: number | null;
  logo_url: string | null;
}

export interface Receipts {
  id: string;
  tenant_id: string | null;
  property_id: string | null;
  amount: number | null;
  period: string | null;
  receipt_no: string | null;
  approved_by: string | null;
  approved_at: string | null;
  receipt_pdf_url: string | null;
  status: string | null;
}

export interface TenantVerification {
  id: string;
  tenant_id: string | null;
  property_id: string | null;
  id_type: string | null;
  id_number: string | null;
  id_document_url: string | null;
  passport_photo_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_phone: string | null;
  occupation: string | null;
  status: string | null;
  verified_at: string | null;
}

export interface Units {
  id: string;
  property_id: string | null;
  tenant_id: string | null;
  unit_name: string | null;
  type: string | null;
  invite_link: string | null;
  status: string | null;
}

export interface UserPropertyRoles {
  id: string;
  user_id: string | null;
  property_id: string | null;
  unit_id: string | null;
  role: string | null;
  status: string | null;
}

export interface UserRoles {
  id: string;
  user_id: string;
  role: string | null;
  scope: string | null;
  scope_id: string | null;
  status: string | null;
  created_at: string | null;
}

export interface Users {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string;
  created_at: string | null;
}

export interface VisitorPasses {
  id: string;
  tenant_id: string | null;
  property_id: string | null;
  visitor_name: string | null;
  valid_on: string | null;
  status: string | null;
  qr_sig: string | null;
  created_at: string | null;
  expires_at: string | null;
}
