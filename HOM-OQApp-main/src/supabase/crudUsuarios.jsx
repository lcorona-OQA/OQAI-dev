import { supabase } from "../supabase/supabase.config";

export const InsertarUsuarios = async (p) => {
  const result = await MostrarUsuarioXIdAuthSupabase(p.idauth_supabase);
  if (result.length == 0) {
    try {
      const { data } = await supabase.from("users").insert(p).select();
      return data;
    } catch (error) {
      alert(error.error_description || error.message);
    }
  }
};
export const MostrarUsuarioXIdAuthSupabase = async (idauth_supabase) => {
  try {
    const { data, error } = await supabase.from('users')
  .select('id,display_name,photo_url,email') // Corrected column names
  .eq('id', idauth_supabase); // Corrected column name in the filter
   
   return data;
  } catch (error) {
    alert(error.error_description || error.message);
  }
};