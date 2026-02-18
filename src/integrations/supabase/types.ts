export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ap_invoices: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          due_date: string
          id: string
          invoice_amount: number
          invoice_date: string
          notes: string | null
          outstanding_amount: number
          overdue_amount: number
          overdue_days: number
          paid_amount: number
          paid_date: string | null
          po_number: string
          product_name: string | null
          rejected_reason: string | null
          sp_po_date: string
          status: Database["public"]["Enums"]["record_status"]
          terms_id: string | null
          updated_at: string
          vendor_id: string
          vendor_invoice_number: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          due_date: string
          id?: string
          invoice_amount?: number
          invoice_date: string
          notes?: string | null
          outstanding_amount?: number
          overdue_amount?: number
          overdue_days?: number
          paid_amount?: number
          paid_date?: string | null
          po_number: string
          product_name?: string | null
          rejected_reason?: string | null
          sp_po_date: string
          status?: Database["public"]["Enums"]["record_status"]
          terms_id?: string | null
          updated_at?: string
          vendor_id: string
          vendor_invoice_number: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          due_date?: string
          id?: string
          invoice_amount?: number
          invoice_date?: string
          notes?: string | null
          outstanding_amount?: number
          overdue_amount?: number
          overdue_days?: number
          paid_amount?: number
          paid_date?: string | null
          po_number?: string
          product_name?: string | null
          rejected_reason?: string | null
          sp_po_date?: string
          status?: Database["public"]["Enums"]["record_status"]
          terms_id?: string | null
          updated_at?: string
          vendor_id?: string
          vendor_invoice_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "ap_invoices_terms_id_fkey"
            columns: ["terms_id"]
            isOneToOne: false
            referencedRelation: "payment_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      ap_payment_allocations: {
        Row: {
          amount: number
          ap_invoice_id: string
          created_at: string
          id: string
          payment_id: string
        }
        Insert: {
          amount: number
          ap_invoice_id: string
          created_at?: string
          id?: string
          payment_id: string
        }
        Update: {
          amount?: number
          ap_invoice_id?: string
          created_at?: string
          id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ap_payment_allocations_ap_invoice_id_fkey"
            columns: ["ap_invoice_id"]
            isOneToOne: false
            referencedRelation: "ap_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "ap_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      ap_payments: {
        Row: {
          bank_account_id: string | null
          created_at: string
          created_by: string
          id: string
          notes: string | null
          payment_date: string
          reference_no: string | null
          total_amount: number
        }
        Insert: {
          bank_account_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          payment_date: string
          reference_no?: string | null
          total_amount?: number
        }
        Update: {
          bank_account_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          payment_date?: string
          reference_no?: string | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "ap_payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ar_invoices: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          customer_id: string
          doc_sent_date: string | null
          due_date: string
          id: string
          invoice_amount: number
          invoice_date: string
          invoice_number: string
          notes: string | null
          order_number: string
          outstanding_amount: number
          overdue_amount: number
          overdue_days: number
          paid_amount: number
          paid_date: string | null
          rejected_reason: string | null
          sales_id: string | null
          sp_po_date: string
          status: Database["public"]["Enums"]["record_status"]
          terms_id: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          customer_id: string
          doc_sent_date?: string | null
          due_date: string
          id?: string
          invoice_amount?: number
          invoice_date: string
          invoice_number: string
          notes?: string | null
          order_number: string
          outstanding_amount?: number
          overdue_amount?: number
          overdue_days?: number
          paid_amount?: number
          paid_date?: string | null
          rejected_reason?: string | null
          sales_id?: string | null
          sp_po_date: string
          status?: Database["public"]["Enums"]["record_status"]
          terms_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string
          doc_sent_date?: string | null
          due_date?: string
          id?: string
          invoice_amount?: number
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          order_number?: string
          outstanding_amount?: number
          overdue_amount?: number
          overdue_days?: number
          paid_amount?: number
          paid_date?: string | null
          rejected_reason?: string | null
          sales_id?: string | null
          sp_po_date?: string
          status?: Database["public"]["Enums"]["record_status"]
          terms_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ar_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ar_invoices_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ar_invoices_terms_id_fkey"
            columns: ["terms_id"]
            isOneToOne: false
            referencedRelation: "payment_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      ar_receipt_allocations: {
        Row: {
          amount: number
          ar_invoice_id: string
          created_at: string
          id: string
          receipt_id: string
        }
        Insert: {
          amount: number
          ar_invoice_id: string
          created_at?: string
          id?: string
          receipt_id: string
        }
        Update: {
          amount?: number
          ar_invoice_id?: string
          created_at?: string
          id?: string
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ar_receipt_allocations_ar_invoice_id_fkey"
            columns: ["ar_invoice_id"]
            isOneToOne: false
            referencedRelation: "ar_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ar_receipt_allocations_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "ar_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      ar_receipts: {
        Row: {
          bank_account_id: string | null
          created_at: string
          created_by: string
          id: string
          notes: string | null
          receipt_date: string
          reference_no: string | null
          total_amount: number
        }
        Insert: {
          bank_account_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          receipt_date: string
          reference_no?: string | null
          total_amount?: number
        }
        Update: {
          bank_account_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          receipt_date?: string
          reference_no?: string | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "ar_receipts_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          entity_id: string
          entity_type: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          entity_id: string
          entity_type: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string
          actor_role: Database["public"]["Enums"]["user_role"]
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_super_admin_action: boolean
          reason: string | null
        }
        Insert: {
          action: string
          actor_id: string
          actor_role: Database["public"]["Enums"]["user_role"]
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_super_admin_action?: boolean
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          actor_role?: Database["public"]["Enums"]["user_role"]
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_super_admin_action?: boolean
          reason?: string | null
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_no: string
          bank_name: string
          created_at: string
          id: string
          is_active: boolean
        }
        Insert: {
          account_name: string
          account_no: string
          bank_name: string
          created_at?: string
          id?: string
          is_active?: boolean
        }
        Update: {
          account_name?: string
          account_no?: string
          bank_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
        }
        Relationships: []
      }
      billing_email_logs: {
        Row: {
          ar_invoice_id: string
          billing_letter_id: string | null
          body_preview: string | null
          cc_email: string | null
          error_message: string | null
          id: string
          sent_at: string
          sent_by: string
          status: Database["public"]["Enums"]["email_status"]
          subject: string
          to_email: string
        }
        Insert: {
          ar_invoice_id: string
          billing_letter_id?: string | null
          body_preview?: string | null
          cc_email?: string | null
          error_message?: string | null
          id?: string
          sent_at?: string
          sent_by: string
          status: Database["public"]["Enums"]["email_status"]
          subject: string
          to_email: string
        }
        Update: {
          ar_invoice_id?: string
          billing_letter_id?: string | null
          body_preview?: string | null
          cc_email?: string | null
          error_message?: string | null
          id?: string
          sent_at?: string
          sent_by?: string
          status?: Database["public"]["Enums"]["email_status"]
          subject?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_email_logs_ar_invoice_id_fkey"
            columns: ["ar_invoice_id"]
            isOneToOne: false
            referencedRelation: "ar_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_email_logs_billing_letter_id_fkey"
            columns: ["billing_letter_id"]
            isOneToOne: false
            referencedRelation: "billing_letters"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_letters: {
        Row: {
          ar_invoice_id: string
          created_at: string
          created_by: string
          id: string
          letter_date: string
          letter_no: string
          notes: string | null
          pdf_url: string | null
          status: Database["public"]["Enums"]["record_status"]
        }
        Insert: {
          ar_invoice_id: string
          created_at?: string
          created_by: string
          id?: string
          letter_date?: string
          letter_no: string
          notes?: string | null
          pdf_url?: string | null
          status?: Database["public"]["Enums"]["record_status"]
        }
        Update: {
          ar_invoice_id?: string
          created_at?: string
          created_by?: string
          id?: string
          letter_date?: string
          letter_no?: string
          notes?: string | null
          pdf_url?: string | null
          status?: Database["public"]["Enums"]["record_status"]
        }
        Relationships: [
          {
            foreignKeyName: "billing_letters_ar_invoice_id_fkey"
            columns: ["ar_invoice_id"]
            isOneToOne: false
            referencedRelation: "ar_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      company_profile: {
        Row: {
          address: string | null
          brand_name: string
          company_name: string
          email: string | null
          id: string
          logo_url: string | null
          phone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          brand_name?: string
          company_name?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          brand_name?: string
          company_name?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          billing_email: string | null
          created_at: string
          customer_name: string
          id: string
          is_active: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          billing_email?: string | null
          created_at?: string
          customer_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          billing_email?: string | null
          created_at?: string
          customer_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          entity: string
          failed_rows: number
          file_name: string
          id: string
          status: string
          success_rows: number
          total_rows: number
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          entity: string
          failed_rows?: number
          file_name: string
          id?: string
          status?: string
          success_rows?: number
          total_rows?: number
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          entity?: string
          failed_rows?: number
          file_name?: string
          id?: string
          status?: string
          success_rows?: number
          total_rows?: number
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      import_row_errors: {
        Row: {
          batch_id: string
          column_name: string | null
          error_message: string
          id: string
          row_number: number
        }
        Insert: {
          batch_id: string
          column_name?: string | null
          error_message: string
          id?: string
          row_number: number
        }
        Update: {
          batch_id?: string
          column_name?: string | null
          error_message?: string
          id?: string
          row_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_row_errors_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_requests: {
        Row: {
          ap_invoice_id: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          request_date: string
          request_no: string
          requested_by: string
          status: string
          updated_at: string
        }
        Insert: {
          ap_invoice_id: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          request_date?: string
          request_no: string
          requested_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          ap_invoice_id?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          request_date?: string
          request_no?: string
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_ap_invoice_id_fkey"
            columns: ["ap_invoice_id"]
            isOneToOne: false
            referencedRelation: "ap_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_terms: {
        Row: {
          created_at: string
          days: number
          id: string
          is_active: boolean
          terms_name: string
        }
        Insert: {
          created_at?: string
          days?: number
          id?: string
          is_active?: boolean
          terms_name: string
        }
        Update: {
          created_at?: string
          days?: number
          id?: string
          is_active?: boolean
          terms_name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          phone: string | null
          sales_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          sales_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          sales_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          address: string | null
          bank_account_no: string | null
          bank_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          phone: string | null
          updated_at: string
          vendor_name: string
        }
        Insert: {
          address?: string | null
          bank_account_no?: string | null
          bank_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
          vendor_name: string
        }
        Update: {
          address?: string | null
          bank_account_no?: string | null
          bank_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
          vendor_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_payment_request_no: { Args: never; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      email_status: "SENT" | "FAILED"
      record_status:
        | "DRAFT"
        | "SUBMITTED"
        | "APPROVED"
        | "REJECTED"
        | "PARTIAL"
        | "PAID"
        | "CANCELLED"
        | "REVISION_REQUESTED"
      user_role: "PURCHASING" | "FINANCE" | "ADMIN" | "SUPER_ADMIN"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      email_status: ["SENT", "FAILED"],
      record_status: [
        "DRAFT",
        "SUBMITTED",
        "APPROVED",
        "REJECTED",
        "PARTIAL",
        "PAID",
        "CANCELLED",
        "REVISION_REQUESTED",
      ],
      user_role: ["PURCHASING", "FINANCE", "ADMIN", "SUPER_ADMIN"],
    },
  },
} as const
