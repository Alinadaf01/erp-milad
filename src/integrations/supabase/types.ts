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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bom: {
        Row: {
          created_at: string
          id: string
          material_id: string
          product_id: string
          qty_120: number | null
          qty_140: number | null
          qty_160: number | null
          qty_180: number | null
          qty_200: number | null
          qty_90: number | null
          qty_per_base_width: number
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          product_id: string
          qty_120?: number | null
          qty_140?: number | null
          qty_160?: number | null
          qty_180?: number | null
          qty_200?: number | null
          qty_90?: number | null
          qty_per_base_width?: number
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          product_id?: string
          qty_120?: number | null
          qty_140?: number | null
          qty_160?: number | null
          qty_180?: number | null
          qty_200?: number | null
          qty_90?: number | null
          qty_per_base_width?: number
        }
        Relationships: [
          {
            foreignKeyName: "bom_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_consumption: {
        Row: {
          consumption_date: string
          created_at: string
          created_by: string | null
          id: string
          material_id: string | null
          note: string | null
          quantity: number
        }
        Insert: {
          consumption_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          material_id?: string | null
          note?: string | null
          quantity?: number
        }
        Update: {
          consumption_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          material_id?: string | null
          note?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_consumption_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_production: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          product_id: string | null
          production_date: string
          quantity: number
          width: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          product_id?: string | null
          production_date?: string
          quantity?: number
          width?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          product_id?: string | null
          production_date?: string
          quantity?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_production_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          id: string
          product_id: string
          qty: number
          updated_at: string
          width: number
        }
        Insert: {
          id?: string
          product_id: string
          qty?: number
          updated_at?: string
          width: number
        }
        Update: {
          id?: string
          product_id?: string
          qty?: number
          updated_at?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          material_id: string
          note: string | null
          quantity: number
          transaction_date: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          material_id: string
          note?: string | null
          quantity: number
          transaction_date?: string
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          material_id?: string
          note?: string | null
          quantity?: number
          transaction_date?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      order_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          new_value: string | null
          old_value: string | null
          order_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          order_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          order_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_audit_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          order_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          order_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          order_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_comments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string
          qty: number
          unit_price: number | null
          width: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          qty?: number
          unit_price?: number | null
          width: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          qty?: number
          unit_price?: number | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          created_by: string | null
          customer: string
          deleted_at: string | null
          due_date: string | null
          exit_number: string | null
          id: string
          is_walk_in: boolean
          notes: string | null
          order_date: string
          previous_status: string | null
          proforma_number: string | null
          representative_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer: string
          deleted_at?: string | null
          due_date?: string | null
          exit_number?: string | null
          id?: string
          is_walk_in?: boolean
          notes?: string | null
          order_date?: string
          previous_status?: string | null
          proforma_number?: string | null
          representative_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer?: string
          deleted_at?: string | null
          due_date?: string | null
          exit_number?: string | null
          id?: string
          is_walk_in?: boolean
          notes?: string | null
          order_date?: string
          previous_status?: string | null
          proforma_number?: string | null
          representative_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_representative_id_fkey"
            columns: ["representative_id"]
            isOneToOne: false
            referencedRelation: "representatives"
            referencedColumns: ["id"]
          },
        ]
      }
      product_inventory_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          product_id: string | null
          quantity: number
          transaction_date: string
          type: string
          width: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          product_id?: string | null
          quantity: number
          transaction_date?: string
          type: string
          width?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          product_id?: string | null
          quantity?: number
          transaction_date?: string
          type?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category: string
          created_at: string
          id: string
          length: number
          name: string
          updated_at: string
          widths: number[]
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          id?: string
          length?: number
          name: string
          updated_at?: string
          widths?: number[]
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          id?: string
          length?: number
          name?: string
          updated_at?: string
          widths?: number[]
        }
        Relationships: []
      }
      raw_material_sizes: {
        Row: {
          created_at: string
          id: string
          material_id: string
          quantity: number
          updated_at: string
          width: number
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          quantity?: number
          updated_at?: string
          width: number
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          quantity?: number
          updated_at?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "raw_material_sizes_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_materials: {
        Row: {
          bom_type: string
          calc_type: string
          created_at: string
          id: string
          is_sized: boolean
          material_type: string
          name: string
          price: number
          stock: number
          unit: string
          updated_at: string
        }
        Insert: {
          bom_type?: string
          calc_type?: string
          created_at?: string
          id?: string
          is_sized?: boolean
          material_type?: string
          name: string
          price?: number
          stock?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          bom_type?: string
          calc_type?: string
          created_at?: string
          id?: string
          is_sized?: boolean
          material_type?: string
          name?: string
          price?: number
          stock?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      representatives: {
        Row: {
          address: string | null
          allowed_users: string[] | null
          can_order: boolean
          city: string | null
          created_at: string
          id: string
          is_active: boolean
          level: string | null
          name: string
          province: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          allowed_users?: string[] | null
          can_order?: boolean
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          level?: string | null
          name: string
          province?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          allowed_users?: string[] | null
          can_order?: boolean
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          level?: string | null
          name?: string
          province?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string
          full_name: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "user"
        | "sales_manager"
        | "factory_manager"
        | "sales_expert"
        | "production_manager"
        | "warehouse_keeper"
        | "marketing_manager"
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
      app_role: [
        "admin",
        "user",
        "sales_manager",
        "factory_manager",
        "sales_expert",
        "production_manager",
        "warehouse_keeper",
        "marketing_manager",
      ],
    },
  },
} as const
