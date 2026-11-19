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
      admin_role_events: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          target_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          target_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          target_id?: string
        }
        Relationships: []
      }
      ai_coins: {
        Row: {
          active: boolean
          binance_ok: boolean | null
          binance_symbol: string | null
          id: string
          image: string | null
          market_cap: number | null
          name: string
          rank: number | null
          swap_coin: string | null
          symbol: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          binance_ok?: boolean | null
          binance_symbol?: string | null
          id: string
          image?: string | null
          market_cap?: number | null
          name: string
          rank?: number | null
          swap_coin?: string | null
          symbol: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          binance_ok?: boolean | null
          binance_symbol?: string | null
          id?: string
          image?: string | null
          market_cap?: number | null
          name?: string
          rank?: number | null
          swap_coin?: string | null
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_daily_prices: {
        Row: {
          close: number
          coin_id: string
          day: string
          high: number | null
          low: number | null
          open: number | null
          source: string
          volume: number | null
        }
        Insert: {
          close: number
          coin_id: string
          day: string
          high?: number | null
          low?: number | null
          open?: number | null
          source: string
          volume?: number | null
        }
        Update: {
          close?: number
          coin_id?: string
          day?: string
          high?: number | null
          low?: number | null
          open?: number | null
          source?: string
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_daily_prices_coin_id_fkey"
            columns: ["coin_id"]
            isOneToOne: false
            referencedRelation: "ai_coins"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_plan_checks: {
        Row: {
          created_at: string
          day: string
          id: string
          message: string
          plan_id: string
          sent_at: string | null
          suggestion: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          day: string
          id?: string
          message: string
          plan_id: string
          sent_at?: string | null
          suggestion: Json
          user_id: string
        }
        Update: {
          created_at?: string
          day?: string
          id?: string
          message?: string
          plan_id?: string
          sent_at?: string | null
          suggestion?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_plan_checks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "ai_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_plans: {
        Row: {
          commit_tsd: number
          created_at: string
          id: string
          locked_at: string
          name: string
          settings: Json
          status: string
          telegram_daily: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          commit_tsd: number
          created_at?: string
          id?: string
          locked_at?: string
          name: string
          settings: Json
          status?: string
          telegram_daily?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          commit_tsd?: number
          created_at?: string
          id?: string
          locked_at?: string
          name?: string
          settings?: Json
          status?: string
          telegram_daily?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_playbook_notes: {
        Row: {
          created_at: string
          goal: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          execution_enabled: boolean
          id: number
          max_commit_tsd: number
          one_tap_limit_usd: number
          updated_at: string
        }
        Insert: {
          execution_enabled?: boolean
          id?: number
          max_commit_tsd?: number
          one_tap_limit_usd?: number
          updated_at?: string
        }
        Update: {
          execution_enabled?: boolean
          id?: number
          max_commit_tsd?: number
          one_tap_limit_usd?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_sync_requests: {
        Row: {
          coin_id: string | null
          created_at: string
          id: number
          kind: string
        }
        Insert: {
          coin_id?: string | null
          created_at?: string
          id: number
          kind: string
        }
        Update: {
          coin_id?: string | null
          created_at?: string
          id?: number
          kind?: string
        }
        Relationships: []
      }
      alert_log: {
        Row: {
          kind: string
          sent_at: string
          subject: string
          user_id: string
        }
        Insert: {
          kind: string
          sent_at?: string
          subject: string
          user_id: string
        }
        Update: {
          kind?: string
          sent_at?: string
          subject?: string
          user_id?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          ip_allowlist: string[]
          key_id: string
          label: string
          last_used_at: string | null
          scopes: string[]
          secret: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          ip_allowlist?: string[]
          key_id: string
          label?: string
          last_used_at?: string | null
          scopes?: string[]
          secret: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          ip_allowlist?: string[]
          key_id?: string
          label?: string
          last_used_at?: string | null
          scopes?: string[]
          secret?: string
          user_id?: string
        }
        Relationships: []
      }
      api_rate_buckets: {
        Row: {
          key_id: string
          weight: number
          window_start: string
        }
        Insert: {
          key_id: string
          weight?: number
          window_start: string
        }
        Update: {
          key_id?: string
          weight?: number
          window_start?: string
        }
        Relationships: []
      }
      chain_snapshots: {
        Row: {
          address: string | null
          bucket: string
          captured_at: string
          chain: string
          chain_lp_actions_paused: boolean | null
          chain_trading_paused: boolean | null
          dust_threshold: number | null
          gas_rate: number | null
          gas_rate_units: string | null
          global_trading_paused: boolean | null
          halted: boolean | null
          observed_fee_rate: number | null
          outbound_fee: number | null
          outbound_tx_size: number | null
          router: string | null
        }
        Insert: {
          address?: string | null
          bucket: string
          captured_at?: string
          chain: string
          chain_lp_actions_paused?: boolean | null
          chain_trading_paused?: boolean | null
          dust_threshold?: number | null
          gas_rate?: number | null
          gas_rate_units?: string | null
          global_trading_paused?: boolean | null
          halted?: boolean | null
          observed_fee_rate?: number | null
          outbound_fee?: number | null
          outbound_tx_size?: number | null
          router?: string | null
        }
        Update: {
          address?: string | null
          bucket?: string
          captured_at?: string
          chain?: string
          chain_lp_actions_paused?: boolean | null
          chain_trading_paused?: boolean | null
          dust_threshold?: number | null
          gas_rate?: number | null
          gas_rate_units?: string | null
          global_trading_paused?: boolean | null
          halted?: boolean | null
          observed_fee_rate?: number | null
          outbound_fee?: number | null
          outbound_tx_size?: number | null
          router?: string | null
        }
        Relationships: []
      }
      custody_attestations: {
        Row: {
          id: string
          keys_held: number
          keys_wiped: number
          taken_at: string
        }
        Insert: {
          id?: string
          keys_held?: number
          keys_wiped?: number
          taken_at?: string
        }
        Update: {
          id?: string
          keys_held?: number
          keys_wiped?: number
          taken_at?: string
        }
        Relationships: []
      }
      deposit_sightings: {
        Row: {
          amount: number
          asset: string
          seen_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          asset: string
          seen_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          asset?: string
          seen_at?: string
          user_id?: string
        }
        Relationships: []
      }
      escrows: {
        Row: {
          claimed_at: string | null
          confirmations: number
          created_at: string
          expected_amount: number
          funded_amount: number
          funding_txid: string | null
          id: string
          leg: Database["public"]["Enums"]["escrow_leg"]
          multisig_address: string | null
          release_txid: string | null
          status: Database["public"]["Enums"]["escrow_status"]
          trade_id: string
          updated_at: string
        }
        Insert: {
          claimed_at?: string | null
          confirmations?: number
          created_at?: string
          expected_amount: number
          funded_amount?: number
          funding_txid?: string | null
          id?: string
          leg: Database["public"]["Enums"]["escrow_leg"]
          multisig_address?: string | null
          release_txid?: string | null
          status?: Database["public"]["Enums"]["escrow_status"]
          trade_id: string
          updated_at?: string
        }
        Update: {
          claimed_at?: string | null
          confirmations?: number
          created_at?: string
          expected_amount?: number
          funded_amount?: number
          funding_txid?: string | null
          id?: string
          leg?: Database["public"]["Enums"]["escrow_leg"]
          multisig_address?: string | null
          release_txid?: string | null
          status?: Database["public"]["Enums"]["escrow_status"]
          trade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escrows_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      gas_topups: {
        Row: {
          created_at: string
          error: string | null
          id: string
          route_id: string
          status: string
          to_address: string
          txid: string | null
          updated_at: string
          usd: number
          user_id: string
          wei: number
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          route_id: string
          status?: string
          to_address: string
          txid?: string | null
          updated_at?: string
          usd: number
          user_id: string
          wei: number
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          route_id?: string
          status?: string
          to_address?: string
          txid?: string | null
          updated_at?: string
          usd?: number
          user_id?: string
          wei?: number
        }
        Relationships: []
      }
      hme_link_requests: {
        Row: {
          challenge: string
          challenge_id: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          recipient_priv_ciphertext: string
          recipient_pubkey: string
          user_id: string
        }
        Insert: {
          challenge: string
          challenge_id: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          recipient_priv_ciphertext: string
          recipient_pubkey: string
          user_id: string
        }
        Update: {
          challenge?: string
          challenge_id?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          recipient_priv_ciphertext?: string
          recipient_pubkey?: string
          user_id?: string
        }
        Relationships: []
      }
      hme_links: {
        Row: {
          account: number
          created_at: string
          id: string
          identity_address: string
          key_ciphertext: string | null
          mode: string
          paths: Json
          revoked_at: string | null
          revoked_by: string | null
          status: string
          user_id: string
          xpubs: Json
        }
        Insert: {
          account: number
          created_at?: string
          id?: string
          identity_address: string
          key_ciphertext?: string | null
          mode: string
          paths: Json
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          user_id: string
          xpubs: Json
        }
        Update: {
          account?: number
          created_at?: string
          id?: string
          identity_address?: string
          key_ciphertext?: string | null
          mode?: string
          paths?: Json
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          user_id?: string
          xpubs?: Json
        }
        Relationships: []
      }
      hme_trade_proposals: {
        Row: {
          chain: string
          created_at: string
          expires_at: string
          id: string
          link_id: string
          psbt: string
          responded_at: string | null
          signed_psbt: string | null
          status: string
          summary: string
          trade_id: string | null
          user_id: string
        }
        Insert: {
          chain: string
          created_at?: string
          expires_at: string
          id?: string
          link_id: string
          psbt: string
          responded_at?: string | null
          signed_psbt?: string | null
          status?: string
          summary: string
          trade_id?: string | null
          user_id: string
        }
        Update: {
          chain?: string
          created_at?: string
          expires_at?: string
          id?: string
          link_id?: string
          psbt?: string
          responded_at?: string | null
          signed_psbt?: string | null
          status?: string
          summary?: string
          trade_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hme_trade_proposals_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "hme_links"
            referencedColumns: ["id"]
          },
        ]
      }
      ignite_admin_emails: {
        Row: {
          id: string
          kind: string
          registration_id: string
          sent_at: string
          sent_by: string
          status: string
          subject: string
          to_email: string
        }
        Insert: {
          id?: string
          kind: string
          registration_id: string
          sent_at?: string
          sent_by: string
          status?: string
          subject: string
          to_email: string
        }
        Update: {
          id?: string
          kind?: string
          registration_id?: string
          sent_at?: string
          sent_by?: string
          status?: string
          subject?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "ignite_admin_emails_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "ignite_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      ignite_peer_emails: {
        Row: {
          id: string
          link_id: string
          registrant_id: string
          sent_at: string
          to_email: string
        }
        Insert: {
          id?: string
          link_id: string
          registrant_id: string
          sent_at?: string
          to_email: string
        }
        Update: {
          id?: string
          link_id?: string
          registrant_id?: string
          sent_at?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "ignite_peer_emails_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "ignite_peer_links"
            referencedColumns: ["id"]
          },
        ]
      }
      ignite_peer_links: {
        Row: {
          cancelled_at: string | null
          created_at: string
          expires_at: string
          id: string
          invoice_id: string | null
          opened_at: string | null
          paid_at: string | null
          payer_email: string | null
          payer_hm_member_id: string | null
          payer_id: string | null
          payer_name: string | null
          registrant_id: string
          registration_id: string
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          invoice_id?: string | null
          opened_at?: string | null
          paid_at?: string | null
          payer_email?: string | null
          payer_hm_member_id?: string | null
          payer_id?: string | null
          payer_name?: string | null
          registrant_id: string
          registration_id: string
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invoice_id?: string | null
          opened_at?: string | null
          paid_at?: string | null
          payer_email?: string | null
          payer_hm_member_id?: string | null
          payer_id?: string | null
          payer_name?: string | null
          registrant_id?: string
          registration_id?: string
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ignite_peer_links_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "ignite_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      ignite_registrations: {
        Row: {
          amount_usd: number
          checkout_url: string | null
          confirmed_at: string | null
          country_code: string
          created_at: string
          email: string
          full_name: string
          hm_member_id: string | null
          id: string
          invoice_expires_at: string | null
          invoice_id: string | null
          marketing_opt_in: boolean
          paid_amount_usd: number | null
          paid_asset: string | null
          paid_chain: string | null
          payment_method: string
          phone: string
          ref_code: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_usd: number
          checkout_url?: string | null
          confirmed_at?: string | null
          country_code: string
          created_at?: string
          email: string
          full_name: string
          hm_member_id?: string | null
          id?: string
          invoice_expires_at?: string | null
          invoice_id?: string | null
          marketing_opt_in?: boolean
          paid_amount_usd?: number | null
          paid_asset?: string | null
          paid_chain?: string | null
          payment_method?: string
          phone: string
          ref_code?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_usd?: number
          checkout_url?: string | null
          confirmed_at?: string | null
          country_code?: string
          created_at?: string
          email?: string
          full_name?: string
          hm_member_id?: string | null
          id?: string
          invoice_expires_at?: string | null
          invoice_id?: string | null
          marketing_opt_in?: boolean
          paid_amount_usd?: number | null
          paid_asset?: string | null
          paid_chain?: string | null
          payment_method?: string
          phone?: string
          ref_code?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      legacy_account_backups: {
        Row: {
          backed_up_at: string
          email: string | null
          id: string
          legacy_user_id: string
          reason: string
          snapshot: Json
        }
        Insert: {
          backed_up_at?: string
          email?: string | null
          id?: string
          legacy_user_id: string
          reason: string
          snapshot: Json
        }
        Update: {
          backed_up_at?: string
          email?: string | null
          id?: string
          legacy_user_id?: string
          reason?: string
          snapshot?: Json
        }
        Relationships: []
      }
      legacy_account_claims: {
        Row: {
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          hm_member_id: string
          id: string
          legacy_user_id: string
          token_hash: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          hm_member_id: string
          id?: string
          legacy_user_id: string
          token_hash: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          hm_member_id?: string
          id?: string
          legacy_user_id?: string
          token_hash?: string
        }
        Relationships: []
      }
      listing_applications: {
        Row: {
          admin_note: string | null
          coin_name: string
          community: string | null
          contact_email: string
          contact_name: string
          contact_telegram: string | null
          contract: string | null
          created_at: string
          id: string
          network: string
          notes: string | null
          package: string
          reviewed_by: string | null
          status: string
          ticker: string
          updated_at: string
          user_id: string
          website: string
        }
        Insert: {
          admin_note?: string | null
          coin_name: string
          community?: string | null
          contact_email: string
          contact_name: string
          contact_telegram?: string | null
          contract?: string | null
          created_at?: string
          id?: string
          network: string
          notes?: string | null
          package: string
          reviewed_by?: string | null
          status?: string
          ticker: string
          updated_at?: string
          user_id: string
          website: string
        }
        Update: {
          admin_note?: string | null
          coin_name?: string
          community?: string | null
          contact_email?: string
          contact_name?: string
          contact_telegram?: string | null
          contract?: string | null
          created_at?: string
          id?: string
          network?: string
          notes?: string | null
          package?: string
          reviewed_by?: string | null
          status?: string
          ticker?: string
          updated_at?: string
          user_id?: string
          website?: string
        }
        Relationships: []
      }
      lock_signed_outpoints: {
        Row: {
          created_at: string
          spend_id: string
          txid: string
          vout: number
        }
        Insert: {
          created_at?: string
          spend_id: string
          txid: string
          vout: number
        }
        Update: {
          created_at?: string
          spend_id?: string
          txid?: string
          vout?: number
        }
        Relationships: [
          {
            foreignKeyName: "lock_signed_outpoints_spend_id_fkey"
            columns: ["spend_id"]
            isOneToOne: false
            referencedRelation: "lock_spends"
            referencedColumns: ["id"]
          },
        ]
      }
      lock_spends: {
        Row: {
          amount: string | null
          created_at: string
          error: string | null
          expires_at: string
          id: string
          inputs: Json
          lock_id: string
          pair_id: string | null
          property_id: number | null
          purpose: string
          signed_txid: string | null
          status: string
          to_address: string
          trade_id: string | null
          unsigned_hex: string
          unsigned_sha256: string
          updated_at: string
        }
        Insert: {
          amount?: string | null
          created_at?: string
          error?: string | null
          expires_at: string
          id?: string
          inputs: Json
          lock_id: string
          pair_id?: string | null
          property_id?: number | null
          purpose: string
          signed_txid?: string | null
          status?: string
          to_address: string
          trade_id?: string | null
          unsigned_hex: string
          unsigned_sha256: string
          updated_at?: string
        }
        Update: {
          amount?: string | null
          created_at?: string
          error?: string | null
          expires_at?: string
          id?: string
          inputs?: Json
          lock_id?: string
          pair_id?: string | null
          property_id?: number | null
          purpose?: string
          signed_txid?: string | null
          status?: string
          to_address?: string
          trade_id?: string | null
          unsigned_hex?: string
          unsigned_sha256?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lock_spends_lock_id_fkey"
            columns: ["lock_id"]
            isOneToOne: false
            referencedRelation: "trade_locks"
            referencedColumns: ["id"]
          },
        ]
      }
      market_snapshots: {
        Row: {
          base: string
          captured_at: string
          change_pct: number | null
          day: string
          liquidity: number | null
          live: boolean
          name: string
          pool: string
          price: number
          slug: string
          volume_24h: number
        }
        Insert: {
          base: string
          captured_at?: string
          change_pct?: number | null
          day: string
          liquidity?: number | null
          live?: boolean
          name: string
          pool: string
          price: number
          slug: string
          volume_24h?: number
        }
        Update: {
          base?: string
          captured_at?: string
          change_pct?: number | null
          day?: string
          liquidity?: number | null
          live?: boolean
          name?: string
          pool?: string
          price?: number
          slug?: string
          volume_24h?: number
        }
        Relationships: []
      }
      market_snapshots_5min: {
        Row: {
          asset_tor_price: number | null
          balance_asset: number | null
          balance_rune: number | null
          base: string
          bucket: string
          captured_at: string
          change_pct: number | null
          derived_depth_bps: number | null
          liquidity: number | null
          live: boolean
          lp_units: number | null
          name: string
          pending_inbound_asset: number | null
          pending_inbound_rune: number | null
          pool: string
          pool_units: number | null
          price: number
          savers_capacity_remaining: number | null
          savers_depth: number | null
          savers_fill_bps: number | null
          savers_units: number | null
          short_code: string | null
          slug: string
          status: string | null
          synth_mint_paused: boolean | null
          synth_supply: number | null
          synth_supply_remaining: number | null
          synth_units: number | null
          trading_halted: boolean | null
          volume_24h: number
          volume_asset: number | null
          volume_rune: number | null
        }
        Insert: {
          asset_tor_price?: number | null
          balance_asset?: number | null
          balance_rune?: number | null
          base: string
          bucket: string
          captured_at?: string
          change_pct?: number | null
          derived_depth_bps?: number | null
          liquidity?: number | null
          live?: boolean
          lp_units?: number | null
          name: string
          pending_inbound_asset?: number | null
          pending_inbound_rune?: number | null
          pool: string
          pool_units?: number | null
          price: number
          savers_capacity_remaining?: number | null
          savers_depth?: number | null
          savers_fill_bps?: number | null
          savers_units?: number | null
          short_code?: string | null
          slug: string
          status?: string | null
          synth_mint_paused?: boolean | null
          synth_supply?: number | null
          synth_supply_remaining?: number | null
          synth_units?: number | null
          trading_halted?: boolean | null
          volume_24h?: number
          volume_asset?: number | null
          volume_rune?: number | null
        }
        Update: {
          asset_tor_price?: number | null
          balance_asset?: number | null
          balance_rune?: number | null
          base?: string
          bucket?: string
          captured_at?: string
          change_pct?: number | null
          derived_depth_bps?: number | null
          liquidity?: number | null
          live?: boolean
          lp_units?: number | null
          name?: string
          pending_inbound_asset?: number | null
          pending_inbound_rune?: number | null
          pool?: string
          pool_units?: number | null
          price?: number
          savers_capacity_remaining?: number | null
          savers_depth?: number | null
          savers_fill_bps?: number | null
          savers_units?: number | null
          short_code?: string | null
          slug?: string
          status?: string | null
          synth_mint_paused?: boolean | null
          synth_supply?: number | null
          synth_supply_remaining?: number | null
          synth_units?: number | null
          trading_halted?: boolean | null
          volume_24h?: number
          volume_asset?: number | null
          volume_rune?: number | null
        }
        Relationships: []
      }
      market_snapshots_hourly: {
        Row: {
          hour: string
          liquidity_avg: number | null
          liquidity_min: number | null
          price_close: number | null
          price_high: number | null
          price_low: number | null
          price_open: number | null
          samples: number
          slug: string
          volume_24h_avg: number | null
        }
        Insert: {
          hour: string
          liquidity_avg?: number | null
          liquidity_min?: number | null
          price_close?: number | null
          price_high?: number | null
          price_low?: number | null
          price_open?: number | null
          samples?: number
          slug: string
          volume_24h_avg?: number | null
        }
        Update: {
          hour?: string
          liquidity_avg?: number | null
          liquidity_min?: number | null
          price_close?: number | null
          price_high?: number | null
          price_low?: number | null
          price_open?: number | null
          samples?: number
          slug?: string
          volume_24h_avg?: number | null
        }
        Relationships: []
      }
      nectarpay_events: {
        Row: {
          event_id: string
          invoice_id: string | null
          payload: Json
          received_at: string
          type: string
        }
        Insert: {
          event_id: string
          invoice_id?: string | null
          payload: Json
          received_at?: string
          type: string
        }
        Update: {
          event_id?: string
          invoice_id?: string | null
          payload?: Json
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      network_snapshots: {
        Row: {
          asgard_size: number | null
          bucket: string
          captured_at: string
          desired_validator_set: number | null
          native_tx_fee: number | null
          nodes_active: number | null
          nodes_jailed: number | null
          nodes_maintenance: number | null
          nodes_missing_blocks: number | null
          nodes_total: number | null
          outbound_tx_fee: number | null
          scheduled_queue: number | null
        }
        Insert: {
          asgard_size?: number | null
          bucket: string
          captured_at?: string
          desired_validator_set?: number | null
          native_tx_fee?: number | null
          nodes_active?: number | null
          nodes_jailed?: number | null
          nodes_maintenance?: number | null
          nodes_missing_blocks?: number | null
          nodes_total?: number | null
          outbound_tx_fee?: number | null
          scheduled_queue?: number | null
        }
        Update: {
          asgard_size?: number | null
          bucket?: string
          captured_at?: string
          desired_validator_set?: number | null
          native_tx_fee?: number | null
          nodes_active?: number | null
          nodes_jailed?: number | null
          nodes_maintenance?: number | null
          nodes_missing_blocks?: number | null
          nodes_total?: number | null
          outbound_tx_fee?: number | null
          scheduled_queue?: number | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount: number
          created_at: string
          filled: number
          id: string
          is_demo: boolean
          order_type: string
          pair: string
          price: number
          side: Database["public"]["Enums"]["order_side"]
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          filled?: number
          id?: string
          is_demo?: boolean
          order_type?: string
          pair?: string
          price: number
          side: Database["public"]["Enums"]["order_side"]
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          filled?: number
          id?: string
          is_demo?: boolean
          order_type?: string
          pair?: string
          price?: number
          side?: Database["public"]["Enums"]["order_side"]
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      p2p_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      p2p_dispute_votes: {
        Row: {
          created_at: string
          id: string
          note: string
          trade_id: string
          vote: string
          voter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string
          trade_id: string
          vote: string
          voter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          trade_id?: string
          vote?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "p2p_dispute_votes_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "p2p_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      p2p_feedback: {
        Row: {
          comment: string
          created_at: string
          from_id: string
          id: string
          positive: boolean
          to_id: string
          trade_id: string
        }
        Insert: {
          comment?: string
          created_at?: string
          from_id: string
          id?: string
          positive: boolean
          to_id: string
          trade_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          from_id?: string
          id?: string
          positive?: boolean
          to_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "p2p_feedback_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "p2p_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      p2p_messages: {
        Row: {
          attachment_name: string | null
          attachment_path: string | null
          body: string
          created_at: string
          id: string
          sender_id: string | null
          trade_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_path?: string | null
          body: string
          created_at?: string
          id?: string
          sender_id?: string | null
          trade_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_path?: string | null
          body?: string
          created_at?: string
          id?: string
          sender_id?: string | null
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "p2p_messages_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "p2p_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      p2p_offer_instructions: {
        Row: {
          instructions: string
          offer_id: string
        }
        Insert: {
          instructions?: string
          offer_id: string
        }
        Update: {
          instructions?: string
          offer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "p2p_offer_instructions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: true
            referencedRelation: "p2p_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      p2p_offers: {
        Row: {
          active: boolean
          asset: string
          auto_reply: string
          created_at: string
          fee_pct: number
          id: string
          margin_pct: number
          max_fiat: number
          min_counterparty_trades: number
          min_fiat: number
          new_buyer_max_fiat: number
          payment_methods: string[]
          price: number
          price_mode: string
          seller_id: string
          side: string
          terms: string
          updated_at: string
          verified_at: string | null
          verified_balance: number
          window_minutes: number
        }
        Insert: {
          active?: boolean
          asset: string
          auto_reply?: string
          created_at?: string
          fee_pct?: number
          id?: string
          margin_pct?: number
          max_fiat?: number
          min_counterparty_trades?: number
          min_fiat?: number
          new_buyer_max_fiat?: number
          payment_methods?: string[]
          price: number
          price_mode?: string
          seller_id: string
          side?: string
          terms?: string
          updated_at?: string
          verified_at?: string | null
          verified_balance?: number
          window_minutes?: number
        }
        Update: {
          active?: boolean
          asset?: string
          auto_reply?: string
          created_at?: string
          fee_pct?: number
          id?: string
          margin_pct?: number
          max_fiat?: number
          min_counterparty_trades?: number
          min_fiat?: number
          new_buyer_max_fiat?: number
          payment_methods?: string[]
          price?: number
          price_mode?: string
          seller_id?: string
          side?: string
          terms?: string
          updated_at?: string
          verified_at?: string | null
          verified_balance?: number
          window_minutes?: number
        }
        Relationships: []
      }
      p2p_profiles: {
        Row: {
          away: boolean
          bio: string
          country: string | null
          created_at: string
          handle: string
          hours: string
          hours_from: number | null
          hours_to: number | null
          languages: string[]
          last_seen_at: string | null
          location: string
          payment_details: Json
          quick_replies: string[]
          tz: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          away?: boolean
          bio?: string
          country?: string | null
          created_at?: string
          handle: string
          hours?: string
          hours_from?: number | null
          hours_to?: number | null
          languages?: string[]
          last_seen_at?: string | null
          location?: string
          payment_details?: Json
          quick_replies?: string[]
          tz?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          away?: boolean
          bio?: string
          country?: string | null
          created_at?: string
          handle?: string
          hours?: string
          hours_from?: number | null
          hours_to?: number | null
          languages?: string[]
          last_seen_at?: string | null
          location?: string
          payment_details?: Json
          quick_replies?: string[]
          tz?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      p2p_reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reported_id: string
          reporter_id: string
          status: string
          trade_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reported_id: string
          reporter_id: string
          status?: string
          trade_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reported_id?: string
          reporter_id?: string
          status?: string
          trade_id?: string | null
        }
        Relationships: []
      }
      p2p_trades: {
        Row: {
          asset: string
          buyer_address: string
          buyer_id: string
          cancelled_at: string | null
          created_at: string
          crypto_amount: number
          dispute_reason: string | null
          disputed_by: string | null
          expires_at: string
          fee_fiat: number
          fee_pct: number
          fiat_amount: number
          flagged_reason: string | null
          id: string
          instructions: string
          offer_id: string
          paid_at: string | null
          payment_method: string
          price: number
          release_txid: string | null
          released_at: string | null
          resolution: string | null
          resolved_by: string | null
          seller_id: string
          seller_seen_at: string | null
          status: string
        }
        Insert: {
          asset: string
          buyer_address: string
          buyer_id: string
          cancelled_at?: string | null
          created_at?: string
          crypto_amount: number
          dispute_reason?: string | null
          disputed_by?: string | null
          expires_at: string
          fee_fiat?: number
          fee_pct?: number
          fiat_amount: number
          flagged_reason?: string | null
          id?: string
          instructions?: string
          offer_id: string
          paid_at?: string | null
          payment_method: string
          price: number
          release_txid?: string | null
          released_at?: string | null
          resolution?: string | null
          resolved_by?: string | null
          seller_id: string
          seller_seen_at?: string | null
          status?: string
        }
        Update: {
          asset?: string
          buyer_address?: string
          buyer_id?: string
          cancelled_at?: string | null
          created_at?: string
          crypto_amount?: number
          dispute_reason?: string | null
          disputed_by?: string | null
          expires_at?: string
          fee_fiat?: number
          fee_pct?: number
          fiat_amount?: number
          flagged_reason?: string | null
          id?: string
          instructions?: string
          offer_id?: string
          paid_at?: string | null
          payment_method?: string
          price?: number
          release_txid?: string | null
          released_at?: string | null
          resolution?: string | null
          resolved_by?: string | null
          seller_id?: string
          seller_seen_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "p2p_trades_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "p2p_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      pocket_withdrawals: {
        Row: {
          amount: number
          amount_units: string
          amount_usd: number
          cancelled_at: string | null
          chain: string
          coin: string
          confirmations: number | null
          created_at: string
          error: string | null
          from_address: string
          id: string
          link_id: string
          release_at: string
          sent_at: string | null
          status: string
          to_address: string
          txid: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          amount_units: string
          amount_usd: number
          cancelled_at?: string | null
          chain?: string
          coin: string
          confirmations?: number | null
          created_at?: string
          error?: string | null
          from_address: string
          id?: string
          link_id: string
          release_at: string
          sent_at?: string | null
          status?: string
          to_address: string
          txid?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          amount_units?: string
          amount_usd?: number
          cancelled_at?: string | null
          chain?: string
          coin?: string
          confirmations?: number | null
          created_at?: string
          error?: string | null
          from_address?: string
          id?: string
          link_id?: string
          release_at?: string
          sent_at?: string | null
          status?: string
          to_address?: string
          txid?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          confirm_before_order: boolean
          created_at: string
          default_auth_cap: number | null
          default_auth_hours: number
          default_pair: string | null
          display_name: string
          email_trade_confirmations: boolean
          email_weekly_update: boolean
          hm_member_id: string | null
          hm_status: string
          id: string
          notify_auth_expiring: boolean
          notify_deposit: boolean
          notify_login: boolean
          notify_order_filled: boolean
          notify_p2p: boolean
          notify_settlement: boolean
          notify_settlement_failed: boolean
          notify_weekly_digest: boolean
          onboarding_at: string | null
          onboarding_status: string | null
          reputation: number
          telegram_chat_id: string | null
          telegram_code: string | null
          telegram_code_expires_at: string | null
          telegram_verified: boolean
          timezone: string
          trades_completed: number
          two_factor_on: boolean
          updated_at: string
        }
        Insert: {
          confirm_before_order?: boolean
          created_at?: string
          default_auth_cap?: number | null
          default_auth_hours?: number
          default_pair?: string | null
          display_name?: string
          email_trade_confirmations?: boolean
          email_weekly_update?: boolean
          hm_member_id?: string | null
          hm_status?: string
          id: string
          notify_auth_expiring?: boolean
          notify_deposit?: boolean
          notify_login?: boolean
          notify_order_filled?: boolean
          notify_p2p?: boolean
          notify_settlement?: boolean
          notify_settlement_failed?: boolean
          notify_weekly_digest?: boolean
          onboarding_at?: string | null
          onboarding_status?: string | null
          reputation?: number
          telegram_chat_id?: string | null
          telegram_code?: string | null
          telegram_code_expires_at?: string | null
          telegram_verified?: boolean
          timezone?: string
          trades_completed?: number
          two_factor_on?: boolean
          updated_at?: string
        }
        Update: {
          confirm_before_order?: boolean
          created_at?: string
          default_auth_cap?: number | null
          default_auth_hours?: number
          default_pair?: string | null
          display_name?: string
          email_trade_confirmations?: boolean
          email_weekly_update?: boolean
          hm_member_id?: string | null
          hm_status?: string
          id?: string
          notify_auth_expiring?: boolean
          notify_deposit?: boolean
          notify_login?: boolean
          notify_order_filled?: boolean
          notify_p2p?: boolean
          notify_settlement?: boolean
          notify_settlement_failed?: boolean
          notify_weekly_digest?: boolean
          onboarding_at?: string | null
          onboarding_status?: string | null
          reputation?: number
          telegram_chat_id?: string | null
          telegram_code?: string | null
          telegram_code_expires_at?: string | null
          telegram_verified?: boolean
          timezone?: string
          trades_completed?: number
          two_factor_on?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      send_approvals: {
        Row: {
          amount: number
          asset: string
          created_at: string
          decided_at: string | null
          error: string | null
          expires_at: string
          from_address: string
          id: string
          leg: string
          link_id: string
          meta: Json
          purpose: string
          ref_id: string
          status: string
          telegram_chat_id: string | null
          telegram_message_id: number | null
          to_address: string
          txid: string | null
          used_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          asset: string
          created_at?: string
          decided_at?: string | null
          error?: string | null
          expires_at: string
          from_address: string
          id?: string
          leg: string
          link_id: string
          meta?: Json
          purpose: string
          ref_id: string
          status?: string
          telegram_chat_id?: string | null
          telegram_message_id?: number | null
          to_address: string
          txid?: string | null
          used_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          asset?: string
          created_at?: string
          decided_at?: string | null
          error?: string | null
          expires_at?: string
          from_address?: string
          id?: string
          leg?: string
          link_id?: string
          meta?: Json
          purpose?: string
          ref_id?: string
          status?: string
          telegram_chat_id?: string | null
          telegram_message_id?: number | null
          to_address?: string
          txid?: string | null
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      site_page_views: {
        Row: {
          country: string | null
          created_at: string
          device: string | null
          id: number
          is_new_session: boolean
          path: string
          referrer_host: string | null
          session_id: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          device?: string | null
          id?: number
          is_new_session?: boolean
          path: string
          referrer_host?: string | null
          session_id: string
        }
        Update: {
          country?: string | null
          created_at?: string
          device?: string | null
          id?: number
          is_new_session?: boolean
          path?: string
          referrer_host?: string | null
          session_id?: string
        }
        Relationships: []
      }
      sso_nonces: {
        Row: {
          nonce: string
          used_at: string
        }
        Insert: {
          nonce: string
          used_at?: string
        }
        Update: {
          nonce?: string
          used_at?: string
        }
        Relationships: []
      }
      swap_sends: {
        Row: {
          amount_in: number
          amount_usd: number
          approve_txid: string | null
          checked_at: string | null
          created_at: string
          destination: string
          error: string | null
          expected_out: number | null
          from_address: string
          from_asset: string
          id: string
          link_id: string | null
          memo: string
          min_out: number | null
          out_txid: string | null
          pocket: string
          protocol: string
          router: string | null
          status: string
          to_asset: string
          txid: string | null
          updated_at: string
          user_id: string
          vault: string
        }
        Insert: {
          amount_in: number
          amount_usd: number
          approve_txid?: string | null
          checked_at?: string | null
          created_at?: string
          destination: string
          error?: string | null
          expected_out?: number | null
          from_address: string
          from_asset: string
          id?: string
          link_id?: string | null
          memo: string
          min_out?: number | null
          out_txid?: string | null
          pocket: string
          protocol: string
          router?: string | null
          status?: string
          to_asset: string
          txid?: string | null
          updated_at?: string
          user_id: string
          vault: string
        }
        Update: {
          amount_in?: number
          amount_usd?: number
          approve_txid?: string | null
          checked_at?: string | null
          created_at?: string
          destination?: string
          error?: string | null
          expected_out?: number | null
          from_address?: string
          from_asset?: string
          id?: string
          link_id?: string | null
          memo?: string
          min_out?: number | null
          out_txid?: string | null
          pocket?: string
          protocol?: string
          router?: string | null
          status?: string
          to_asset?: string
          txid?: string | null
          updated_at?: string
          user_id?: string
          vault?: string
        }
        Relationships: []
      }
      trade_events: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: Json
          event: string
          id: string
          trade_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event: string
          id?: string
          trade_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event?: string
          id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_events_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_locks: {
        Row: {
          address: string
          chain: string
          created_at: string
          csv_blocks: number
          custody_mode: string
          generation: number
          id: string
          member_pub: string
          pocket_account: number
          seeds_pub: string
          status: string
          updated_at: string
          user_id: string
          witness_script: string
          wrapper: string
        }
        Insert: {
          address: string
          chain: string
          created_at?: string
          csv_blocks: number
          custody_mode: string
          generation?: number
          id?: string
          member_pub: string
          pocket_account: number
          seeds_pub: string
          status?: string
          updated_at?: string
          user_id: string
          witness_script: string
          wrapper: string
        }
        Update: {
          address?: string
          chain?: string
          created_at?: string
          csv_blocks?: number
          custody_mode?: string
          generation?: number
          id?: string
          member_pub?: string
          pocket_account?: number
          seeds_pub?: string
          status?: string
          updated_at?: string
          user_id?: string
          witness_script?: string
          wrapper?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          amount: number
          created_at: string
          expires_at: string
          id: string
          is_demo: boolean
          maker_id: string | null
          maker_order_id: string | null
          pair: string
          price: number
          settle_started_at: string | null
          side: Database["public"]["Enums"]["order_side"]
          status: Database["public"]["Enums"]["trade_status"]
          taker_id: string | null
          taker_order_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          expires_at?: string
          id?: string
          is_demo?: boolean
          maker_id?: string | null
          maker_order_id?: string | null
          pair?: string
          price: number
          settle_started_at?: string | null
          side: Database["public"]["Enums"]["order_side"]
          status?: Database["public"]["Enums"]["trade_status"]
          taker_id?: string | null
          taker_order_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          expires_at?: string
          id?: string
          is_demo?: boolean
          maker_id?: string | null
          maker_order_id?: string | null
          pair?: string
          price?: number
          settle_started_at?: string | null
          side?: Database["public"]["Enums"]["order_side"]
          status?: Database["public"]["Enums"]["trade_status"]
          taker_id?: string | null
          taker_order_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_maker_order_id_fkey"
            columns: ["maker_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_taker_order_id_fkey"
            columns: ["taker_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      tsd_routes: {
        Row: {
          amount_in: number
          amount_out: number | null
          amount_usd: number
          bridge_deposit: string | null
          bridge_fee_bps: number
          bridge_order_id: string | null
          bridge_out_txid: string | null
          checked_at: string | null
          coin: string
          coin_address: string
          coin_asset: string
          created_at: string
          direction: string
          error: string | null
          evm_address: string
          fresh_out: number | null
          gas_txid: string | null
          id: string
          link_id: string | null
          protocol: string
          resume_stage: string | null
          shown_out: number
          shown_usdc: number
          stage: string
          step_at: string
          swap_send_id: string | null
          tsd_txid: string | null
          txc_address: string
          updated_at: string
          usdc_amount: number | null
          usdc_txid: string | null
          user_id: string
          working_until: string | null
        }
        Insert: {
          amount_in: number
          amount_out?: number | null
          amount_usd: number
          bridge_deposit?: string | null
          bridge_fee_bps?: number
          bridge_order_id?: string | null
          bridge_out_txid?: string | null
          checked_at?: string | null
          coin: string
          coin_address: string
          coin_asset: string
          created_at?: string
          direction: string
          error?: string | null
          evm_address: string
          fresh_out?: number | null
          gas_txid?: string | null
          id?: string
          link_id?: string | null
          protocol?: string
          resume_stage?: string | null
          shown_out: number
          shown_usdc: number
          stage?: string
          step_at?: string
          swap_send_id?: string | null
          tsd_txid?: string | null
          txc_address: string
          updated_at?: string
          usdc_amount?: number | null
          usdc_txid?: string | null
          user_id: string
          working_until?: string | null
        }
        Update: {
          amount_in?: number
          amount_out?: number | null
          amount_usd?: number
          bridge_deposit?: string | null
          bridge_fee_bps?: number
          bridge_order_id?: string | null
          bridge_out_txid?: string | null
          checked_at?: string | null
          coin?: string
          coin_address?: string
          coin_asset?: string
          created_at?: string
          direction?: string
          error?: string | null
          evm_address?: string
          fresh_out?: number | null
          gas_txid?: string | null
          id?: string
          link_id?: string | null
          protocol?: string
          resume_stage?: string | null
          shown_out?: number
          shown_usdc?: number
          stage?: string
          step_at?: string
          swap_send_id?: string | null
          tsd_txid?: string | null
          txc_address?: string
          updated_at?: string
          usdc_amount?: number | null
          usdc_txid?: string | null
          user_id?: string
          working_until?: string | null
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
      wallet_auth_challenges: {
        Row: {
          address: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          nonce: string
          statement: string
        }
        Insert: {
          address: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          nonce: string
          statement: string
        }
        Update: {
          address?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          nonce?: string
          statement?: string
        }
        Relationships: []
      }
      wallet_delegations: {
        Row: {
          asset: string
          chain: string
          created_at: string
          expires_at: string
          id: string
          key_ciphertext: string
          label: string | null
          max_amount: number
          revoked_at: string | null
          spent: number
          trading_address: string
          trading_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asset?: string
          chain?: string
          created_at?: string
          expires_at?: string
          id?: string
          key_ciphertext: string
          label?: string | null
          max_amount?: number
          revoked_at?: string | null
          spent?: number
          trading_address: string
          trading_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asset?: string
          chain?: string
          created_at?: string
          expires_at?: string
          id?: string
          key_ciphertext?: string
          label?: string | null
          max_amount?: number
          revoked_at?: string | null
          spent?: number
          trading_address?: string
          trading_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          backed_up: boolean
          btc_address: string | null
          created_at: string
          evm_address: string | null
          id: string
          isk_address: string | null
          kdf_iterations: number
          kdf_salt: string
          ltc_address: string | null
          txc_address: string
          updated_at: string
          user_id: string
          vault_ciphertext: string
        }
        Insert: {
          backed_up?: boolean
          btc_address?: string | null
          created_at?: string
          evm_address?: string | null
          id?: string
          isk_address?: string | null
          kdf_iterations?: number
          kdf_salt: string
          ltc_address?: string | null
          txc_address: string
          updated_at?: string
          user_id: string
          vault_ciphertext: string
        }
        Update: {
          backed_up?: boolean
          btc_address?: string | null
          created_at?: string
          evm_address?: string | null
          id?: string
          isk_address?: string | null
          kdf_iterations?: number
          kdf_salt?: string
          ltc_address?: string | null
          txc_address?: string
          updated_at?: string
          user_id?: string
          vault_ciphertext?: string
        }
        Relationships: []
      }
      withdrawal_limit_events: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          detail: Json
          id: string
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          detail?: Json
          id?: string
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          detail?: Json
          id?: string
          target_id?: string | null
        }
        Relationships: []
      }
      withdrawal_limit_overrides: {
        Row: {
          frozen: boolean
          note: string
          set_by: string
          tier_level: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          frozen?: boolean
          note: string
          set_by: string
          tier_level?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          frozen?: boolean
          note?: string
          set_by?: string
          tier_level?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      withdrawal_tiers: {
        Row: {
          daily_usd: number
          hold_hours: number
          level: number
          min_account_days: number
          min_trades: number
          min_withdrawals: number
          min_withdrawn_usd: number
          name: string
          per_withdrawal_usd: number
          requires_2fa: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          daily_usd: number
          hold_hours: number
          level: number
          min_account_days?: number
          min_trades?: number
          min_withdrawals?: number
          min_withdrawn_usd?: number
          name: string
          per_withdrawal_usd: number
          requires_2fa?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          daily_usd?: number
          hold_hours?: number
          level?: number
          min_account_days?: number
          min_trades?: number
          min_withdrawals?: number
          min_withdrawn_usd?: number
          name?: string
          per_withdrawal_usd?: number
          requires_2fa?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          amount: number
          asset: string
          chain: string
          created_at: string
          from_address: string
          id: string
          leg: string
          status: string
          to_address: string
          txid: string
          user_id: string
        }
        Insert: {
          amount: number
          asset: string
          chain: string
          created_at?: string
          from_address: string
          id?: string
          leg: string
          status?: string
          to_address: string
          txid: string
          user_id: string
        }
        Update: {
          amount?: number
          asset?: string
          chain?: string
          created_at?: string
          from_address?: string
          id?: string
          leg?: string
          status?: string
          to_address?: string
          txid?: string
          user_id?: string
        }
        Relationships: []
      }
      wrap_orders: {
        Row: {
          amount_delivered: number | null
          amount_expected: number | null
          amount_received: number | null
          base_symbol: string
          created_at: string
          delivery_txid: string | null
          deposit_address: string | null
          deposit_txid: string | null
          direction: Database["public"]["Enums"]["wrap_direction"]
          error: string | null
          expires_at: string | null
          id: string
          issuer_order_id: string | null
          issuer_status: string | null
          payout_address: string | null
          status: Database["public"]["Enums"]["wrap_status"]
          updated_at: string
          user_id: string
          wrapped_symbol: string
        }
        Insert: {
          amount_delivered?: number | null
          amount_expected?: number | null
          amount_received?: number | null
          base_symbol: string
          created_at?: string
          delivery_txid?: string | null
          deposit_address?: string | null
          deposit_txid?: string | null
          direction: Database["public"]["Enums"]["wrap_direction"]
          error?: string | null
          expires_at?: string | null
          id?: string
          issuer_order_id?: string | null
          issuer_status?: string | null
          payout_address?: string | null
          status?: Database["public"]["Enums"]["wrap_status"]
          updated_at?: string
          user_id: string
          wrapped_symbol: string
        }
        Update: {
          amount_delivered?: number | null
          amount_expected?: number | null
          amount_received?: number | null
          base_symbol?: string
          created_at?: string
          delivery_txid?: string | null
          deposit_address?: string | null
          deposit_txid?: string | null
          direction?: Database["public"]["Enums"]["wrap_direction"]
          error?: string | null
          expires_at?: string | null
          id?: string
          issuer_order_id?: string | null
          issuer_status?: string | null
          payout_address?: string | null
          status?: Database["public"]["Enums"]["wrap_status"]
          updated_at?: string
          user_id?: string
          wrapped_symbol?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ai_sync_ingest: { Args: never; Returns: number }
      ai_sync_request: { Args: { _with_markets?: boolean }; Returns: number }
      api_bump_rate: {
        Args: { _key: string; _weight: number; _window: string }
        Returns: number
      }
      cancel_pocket_withdrawal: {
        Args: { _id: string; _user_id: string }
        Returns: boolean
      }
      claim_pocket_withdrawal: { Args: { _id: string }; Returns: boolean }
      custody_snapshot: {
        Args: never
        Returns: {
          keys_held: number
          last_sweep: string
          last_wiped: number
          next_expiry: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_trade_participant: {
        Args: { _trade_id: string; _user_id: string }
        Returns: boolean
      }
      legacy_user_for_email: { Args: { _email: string }; Returns: string }
      market_snapshot_latest: {
        Args: { _max_age_minutes?: number }
        Returns: {
          asset_tor_price: number
          balance_asset: number
          balance_rune: number
          base: string
          bucket: string
          change_pct: number
          derived_depth_bps: number
          high_24h: number
          liquidity: number
          live: boolean
          low_24h: number
          lp_units: number
          name: string
          pending_inbound_asset: number
          pending_inbound_rune: number
          pool: string
          pool_units: number
          price: number
          savers_capacity_remaining: number
          savers_depth: number
          savers_fill_bps: number
          savers_units: number
          slug: string
          spark: number[]
          status: string
          synth_mint_paused: boolean
          synth_supply: number
          synth_supply_remaining: number
          synth_units: number
          trading_halted: boolean
          volume_24h: number
          volume_asset: number
          volume_rune: number
        }[]
      }
      market_snapshots_prune: {
        Args: never
        Returns: {
          hourly_removed: number
          raw_removed: number
        }[]
      }
      market_snapshots_rollup: { Args: never; Returns: number }
      purge_expired_delegations: { Args: never; Returns: number }
      purge_expired_wallet_challenges: { Args: never; Returns: number }
      redeem_legacy_claim: { Args: { _token_hash: string }; Returns: string }
      release_delegation_spend: {
        Args: { _amount: number; _id: string }
        Returns: undefined
      }
      reserve_delegation_spend: {
        Args: {
          _amount: number
          _asset: string
          _chain: string
          _user_id: string
        }
        Returns: string
      }
      reserve_gas_topup: {
        Args: {
          _daily_max_usd: number
          _member_daily_max_usd?: number
          _per_route_max_usd: number
          _route_id: string
          _to_address: string
          _usd: number
          _user_id: string
          _wei: number
        }
        Returns: string
      }
      reserve_lock_outpoints: {
        Args: { _spend_ids: string[] }
        Returns: boolean
      }
      reserve_pocket_withdrawal: {
        Args: {
          _amount: number
          _amount_units: string
          _amount_usd: number
          _coin: string
          _daily_max_usd: number
          _from_address: string
          _hold_hours: number
          _link_id: string
          _max_held: number
          _per_max_usd: number
          _to_address: string
          _user_id: string
        }
        Returns: string
      }
      reserve_swap_send: {
        Args: {
          _amount_in: number
          _amount_usd: number
          _daily_max_usd: number
          _destination: string
          _expected_out: number
          _from_address: string
          _from_asset: string
          _link_id: string
          _memo: string
          _min_out: number
          _per_swap_max_usd: number
          _pocket: string
          _protocol: string
          _route_id?: string
          _router: string
          _to_asset: string
          _user_id: string
          _vault: string
        }
        Returns: string
      }
      reserve_tsd_route: {
        Args: {
          _amount_in: number
          _amount_usd: number
          _bridge_fee_bps: number
          _coin: string
          _coin_address: string
          _coin_asset: string
          _daily_max_usd: number
          _direction: string
          _evm_address: string
          _link_id: string
          _per_swap_max_usd: number
          _protocol: string
          _shown_out: number
          _shown_usdc: number
          _txc_address: string
          _user_id: string
        }
        Returns: string
      }
      save_withdrawal_tiers: {
        Args: { _actor: string; _tiers: Json }
        Returns: string
      }
      set_admin_role: {
        Args: { _actor: string; _grant: boolean; _target: string }
        Returns: string
      }
      set_withdrawal_override: {
        Args: {
          _actor: string
          _clear: boolean
          _frozen: boolean
          _note: string
          _target: string
          _tier: number
        }
        Returns: string
      }
      site_page_views_prune: { Args: never; Returns: undefined }
      site_stats_breakdown: {
        Args: { _days?: number; _dimension: string; _limit?: number }
        Returns: {
          label: string
          value: number
        }[]
      }
      site_stats_daily: {
        Args: { _days?: number }
        Returns: {
          day: string
          pageviews: number
          visitors: number
        }[]
      }
      site_stats_totals: {
        Args: { _days?: number }
        Returns: {
          countries: number
          pages: number
          pageviews: number
          visitors: number
        }[]
      }
    }
    Enums: {
      app_role: "user" | "arbitrator" | "admin"
      escrow_leg:
        | "txc"
        | "usdc"
        | "tsd"
        | "usdt"
        | "ltc"
        | "isk"
        | "zcu"
        | "wbtc"
        | "wltc"
        | "weth"
        | "pls"
        | "hex"
        | "phex"
      escrow_status:
        | "awaiting_funding"
        | "funding_seen"
        | "confirmed"
        | "released"
        | "refunded"
      order_side: "buy" | "sell"
      order_status: "open" | "partial" | "filled" | "cancelled"
      trade_status:
        | "matched"
        | "maker_funded"
        | "taker_funded"
        | "both_funded"
        | "released"
        | "settled"
        | "disputed"
        | "arbitrated"
        | "timed_out"
        | "refunded"
      wrap_direction: "wrap" | "unwrap"
      wrap_status:
        | "created"
        | "awaiting_deposit"
        | "deposit_detected"
        | "deposit_confirmed"
        | "processing"
        | "complete"
        | "failed"
        | "expired"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["user", "arbitrator", "admin"],
      escrow_leg: [
        "txc",
        "usdc",
        "tsd",
        "usdt",
        "ltc",
        "isk",
        "zcu",
        "wbtc",
        "wltc",
        "weth",
        "pls",
        "hex",
        "phex",
      ],
      escrow_status: [
        "awaiting_funding",
        "funding_seen",
        "confirmed",
        "released",
        "refunded",
      ],
      order_side: ["buy", "sell"],
      order_status: ["open", "partial", "filled", "cancelled"],
      trade_status: [
        "matched",
        "maker_funded",
        "taker_funded",
        "both_funded",
        "released",
        "settled",
        "disputed",
        "arbitrated",
        "timed_out",
        "refunded",
      ],
      wrap_direction: ["wrap", "unwrap"],
      wrap_status: [
        "created",
        "awaiting_deposit",
        "deposit_detected",
        "deposit_confirmed",
        "processing",
        "complete",
        "failed",
        "expired",
      ],
    },
  },
} as const
