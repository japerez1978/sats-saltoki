/**
 * Script de migración de fotos SATs
 * De: bcyplfymmtmrbylmilit.supabase.co (viejo)
 * A:  tpgbbriohvsamnfxhbgk.supabase.co (nuevo)
 * 
 * Uso: node migrate-photos.mjs
 */

import { createClient } from '@supabase/supabase-js'

const NEW_URL = 'https://tpgbbriohvsamnfxhbgk.supabase.co'
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwZ2JicmlvaHZzYW1uZnhoYmdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTg5NzMsImV4cCI6MjA5MDk5NDk3M30.YEpqIsn9AhF0JBlc7pppccNlVvNVnQcR-lwRkeRBEwc'
const OLD_REF = 'bcyplfymmtmrbylmilit'
const NEW_REF = 'tpgbbriohvsamnfxhbgk'
const BUCKET = 'sat-fotos'

// SATs login credentials
const SAT_EMAIL = 'nuri.pereda@gmail.com'
const SAT_PASS = process.argv[2]

if (!SAT_PASS) {
  console.error('❌ Uso: node migrate-photos.mjs <password_sats_saltoki>')
  process.exit(1)
}

const supabase = createClient(NEW_URL, NEW_KEY)

async function main() {
  // 1. Login as Saltoki user
  console.log('🔐 Autenticando como', SAT_EMAIL, '...')
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: SAT_EMAIL,
    password: SAT_PASS,
  })
  if (authErr) {
    console.error('❌ Error de auth:', authErr.message)
    process.exit(1)
  }
  console.log('✅ Autenticado\n')

  // 2. Get all sats with fotos
  const { data: sats, error: fetchErr } = await supabase
    .from('sats')
    .select('id, fotos')
  
  if (fetchErr) {
    console.error('❌ Error cargando sats:', fetchErr.message)
    process.exit(1)
  }

  const withPhotos = sats.filter(s => s.fotos?.length > 0)
  console.log(`📸 ${withPhotos.length} SATs con fotos encontrados\n`)

  let migrated = 0, failed = 0

  for (const sat of withPhotos) {
    const newFotos = []
    let changed = false

    for (const url of sat.fotos) {
      if (!url.includes(OLD_REF)) {
        // Already migrated or different source
        newFotos.push(url)
        continue
      }

      // Extract path: sat-fotos/1290/1774948335626.jpg
      const parts = url.split(`/${BUCKET}/`)
      if (parts.length < 2) {
        console.warn(`  ⚠️ URL format unknown: ${url}`)
        newFotos.push(url)
        continue
      }
      const filePath = parts[1]

      try {
        // Download from old (public URL)
        console.log(`  ⬇️  Descargando ${filePath}...`)
        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const blob = await response.blob()
        const buffer = Buffer.from(await blob.arrayBuffer())

        // Upload to new
        console.log(`  ⬆️  Subiendo a nuevo storage...`)
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(filePath, buffer, {
            upsert: true,
            contentType: blob.type || 'image/jpeg',
          })
        if (upErr) throw upErr

        // Build new URL
        const newUrl = url.replace(OLD_REF, NEW_REF)
        newFotos.push(newUrl)
        changed = true
        migrated++
        console.log(`  ✅ OK`)
      } catch (err) {
        console.error(`  ❌ Error: ${err.message}`)
        newFotos.push(url) // keep old URL as fallback
        failed++
      }
    }

    if (changed) {
      // Update URLs in database
      const { error: updErr } = await supabase
        .from('sats')
        .update({ fotos: newFotos })
        .eq('id', sat.id)
      
      if (updErr) {
        console.error(`  ❌ Error actualizando SAT ${sat.id}:`, updErr.message)
      } else {
        console.log(`  📝 SAT ${sat.id} actualizado\n`)
      }
    }
  }

  console.log('\n═══════════════════════════════')
  console.log(`✅ Migradas: ${migrated} fotos`)
  console.log(`❌ Fallidas: ${failed} fotos`)
  console.log('═══════════════════════════════')

  await supabase.auth.signOut()
}

main().catch(console.error)
