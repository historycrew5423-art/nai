using System;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

public static class VeronaGraybox
{
    static Transform root, decor, obstacles, collisions;
    static Material floor, structure, detail, prop;
    static readonly Vector2[] positions = {
        new(-11,-11), new(11,-11), new(-11,11), new(11,11),
        new(-20,0), new(20,0), new(0,-20), new(0,20)
    };
    static readonly float[] radii = {1.2f,1.2f,1.2f,1.2f,1,1,.6f,.6f};
    static readonly float[] heights = {.8f,.8f,.8f,.8f,2.4f,2.4f,2.2f,2.2f};
    static string Output => Path.GetFullPath(Path.Combine(Application.dataPath,"../../output"));

    [MenuItem("Verona/Act 1/Build Graybox")]
    public static void Build()
    {
        if(EditorApplication.isPlaying) throw new InvalidOperationException("Exit Play Mode first.");
        Directory.CreateDirectory("Assets/Verona/Materials");
        Directory.CreateDirectory("Assets/Verona/Scenes");
        AssetDatabase.Refresh();
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
        root = new GameObject("Arena_Act1").transform;
        decor = Group("Decoration_OutsidePlayable",root);
        obstacles = Group("Obstacles_8",root);
        collisions = Group("Collision_8",root);
        floor = Mat("Gray_Floor",new Color(.29f,.30f,.32f));
        structure = Mat("Gray_Architecture",new Color(.43f,.45f,.48f));
        detail = Mat("Gray_Trim",new Color(.65f,.67f,.70f));
        prop = Mat("Gray_Obstacles",new Color(.53f,.55f,.58f));
        Box("PlayableFloor_60x60_TopY0",root,new(0,-.1f,0),new(60,.2f,60),floor,true);
        Box("West_Apron_15m",decor,new(-37.5f,-.1f,0),new(15,.2f,90),floor);
        Box("East_Apron_15m",decor,new(37.5f,-.1f,0),new(15,.2f,90),floor);
        Box("Far_Apron_15m",decor,new(0,-.1f,-37.5f),new(60,.2f,15),floor);
        Box("Near_Apron_15m",decor,new(0,-.1f,37.5f),new(60,.2f,15),floor);
        Box("Far_Wall",decor,new(0,6,-44),new(90,12,1),structure);
        Box("West_Wall",decor,new(-44,6,-7),new(1,12,74),structure);
        Box("East_Wall",decor,new(44,6,-7),new(1,12,74),structure);
        Box("Bandstand_TopY1",decor,new(0,.5f,-35.5f),new(46,1,9),structure);
        Box("Curtain_Placeholder",decor,new(0,6,-43.3f),new(38,10,.25f),floor);
        for(int i=0;i<8;i++) {
            float x=-38+i*(76f/7);
            Cylinder("Far_Pilaster_"+i,decor,new(x,5,-42),.65f,10,detail);
        }
        foreach(float x in new[]{-32f,-22f,22f,32f})
            Box("Tall_Window_Placeholder",decor,new(x,6,-43.2f),new(5,8,.2f),detail);
        foreach(float x in new[]{-34f,34f}) {
            Box("Banquet_LongTable",decor,new(x,.5f,-4),new(4,1,44),prop);
            foreach(float z in new[]{-25f,-12f,1f,14f,25f})
                Cylinder("Side_Column",decor,new(Mathf.Sign(x)*42,5,z),.6f,10,structure);
        }
        // Front (+Z) decoration, including candle placeholders, never exceeds 1m.
        Box("Near_Low_Rail_0_8m",decor,new(0,.4f,31),new(86,.8f,.3f),detail);
        for(int i=0;i<23;i++)
            Cylinder("Near_Candle_Placeholder",decor,new(-42+i*(84f/22),.9f,31),.08f,.2f,prop);
        for(int i=0;i<8;i++) {
            string name=i<4 ? "RoundTable" : i<6 ? "HarpStatue_Blockout" : "Candelabrum_Blockout";
            var p=new Vector3(positions[i].x,heights[i]/2,positions[i].y);
            Cylinder(name+"_"+(i+1).ToString("00"),obstacles,p,radii[i],heights[i],prop);
            var col=Cylinder("COL_CYL_"+(i+1).ToString("00"),collisions,p,radii[i],heights[i],detail);
            col.GetComponent<MeshRenderer>().enabled=false;
            var mc=col.AddComponent<MeshCollider>();
            mc.sharedMesh=col.GetComponent<MeshFilter>().sharedMesh;
            mc.convex=true;
        }
        RenderSettings.skybox=null;
        RenderSettings.ambientMode=AmbientMode.Flat;
        RenderSettings.ambientLight=new Color(.55f,.57f,.62f);
        var light=new GameObject("Graybox_KeyLight").AddComponent<Light>();
        light.type=LightType.Directional; light.intensity=1.4f;
        light.transform.rotation=Quaternion.Euler(48,-35,0);
        light.shadows=LightShadows.Soft;
        Camera cam=CameraAt("GameCam",new(0,18,13),Vector3.zero,45);
        cam.tag="MainCamera";
        cam.gameObject.AddComponent<AudioListener>();
        CameraAt("OverviewCam_ReviewOnly",new(64,82,92),Vector3.zero,52).enabled=false;
        EditorSceneManager.SaveScene(scene,"Assets/Verona/Scenes/Act1_Ballroom_Graybox.unity");
        AssetDatabase.SaveAssets();
        ValidateAndCapture();
    }

    static Transform Group(string n,Transform parent) {
        var t=new GameObject(n).transform; t.SetParent(parent,false); return t;
    }
    static Material Mat(string name,Color color) {
        string path="Assets/Verona/Materials/"+name+".mat";
        var m=AssetDatabase.LoadAssetAtPath<Material>(path);
        if(m==null) {m=new Material(Shader.Find("Universal Render Pipeline/Lit"));AssetDatabase.CreateAsset(m,path);}
        m.SetColor("_BaseColor",color);m.SetFloat("_Smoothness",.12f);m.SetFloat("_Metallic",0);
        return m;
    }
    static GameObject Primitive(PrimitiveType type,string n,Transform parent,Vector3 p,Vector3 scale,Material m,bool collider=false) {
        var g=GameObject.CreatePrimitive(type);g.name=n;g.transform.SetParent(parent,false);
        g.transform.localPosition=p;g.transform.localScale=scale;
        g.GetComponent<Renderer>().sharedMaterial=m;
        if(!collider) UnityEngine.Object.DestroyImmediate(g.GetComponent<Collider>());
        return g;
    }
    static GameObject Box(string n,Transform p,Vector3 pos,Vector3 scale,Material m,bool col=false)
        =>Primitive(PrimitiveType.Cube,n,p,pos,scale,m,col);
    static GameObject Cylinder(string n,Transform p,Vector3 pos,float r,float h,Material m)
        =>Primitive(PrimitiveType.Cylinder,n,p,pos,new(r*2,h/2,r*2),m);
    static Camera CameraAt(string n,Vector3 pos,Vector3 target,float fov) {
        var c=new GameObject(n).AddComponent<Camera>();
        c.transform.position=pos;c.transform.LookAt(target);c.fieldOfView=fov;c.aspect=16f/9;
        c.nearClipPlane=.1f;c.farClipPlane=250;c.clearFlags=CameraClearFlags.SolidColor;
        c.backgroundColor=new Color(.12f,.13f,.16f);
        c.GetUniversalAdditionalCameraData().renderPostProcessing=false;
        return c;
    }
    static void Capture(Camera cam,string file) {
        Directory.CreateDirectory(Path.Combine(Output,"screens"));
        var rt=new RenderTexture(1600,900,24);
        var previous=RenderTexture.active;
        try {
            cam.targetTexture=rt;cam.Render();RenderTexture.active=rt;
            var tex=new Texture2D(1600,900,TextureFormat.RGB24,false);
            tex.ReadPixels(new Rect(0,0,1600,900),0,0);tex.Apply();
            File.WriteAllBytes(Path.Combine(Output,"screens",file),tex.EncodeToPNG());
            UnityEngine.Object.DestroyImmediate(tex);
        } finally {cam.targetTexture=null;RenderTexture.active=previous;UnityEngine.Object.DestroyImmediate(rt);}
    }

    [MenuItem("Verona/Act 1/Validate and Capture Graybox")]
    public static void ValidateAndCapture()
    {
        var arena=GameObject.Find("Arena_Act1");
        if(arena==null) throw new InvalidOperationException("Arena_Act1 missing");
        var cols=arena.GetComponentsInChildren<MeshCollider>().Where(c=>c.name.StartsWith("COL_CYL_")).ToArray();
        if(cols.Length!=8) throw new InvalidOperationException("Expected 8 obstacle cylinders");
        float gap=float.MaxValue;
        for(int i=0;i<8;i++) {
            if(Mathf.Abs(positions[i].x)+radii[i]>26 || Mathf.Abs(positions[i].y)+radii[i]>26)
                throw new InvalidOperationException("Boundary clearance failure");
            if(Mathf.Abs(positions[i].x)-radii[i]<8 && Mathf.Abs(positions[i].y)-radii[i]<8)
                throw new InvalidOperationException("Central 16m square obstructed");
            for(int j=i+1;j<8;j++) gap=Mathf.Min(gap,Vector2.Distance(positions[i],positions[j])-radii[i]-radii[j]);
        }
        if(gap<6) throw new InvalidOperationException("Obstacle spacing below 6m");
        var cam=GameObject.Find("GameCam").GetComponent<Camera>();
        cam.transform.position=new(0,18,13);cam.transform.LookAt(Vector3.zero);
        Capture(cam,"act1-graybox-gamecam.png");
        cam.transform.position=new(22,18,35);cam.transform.LookAt(new Vector3(22,0,22));
        Capture(cam,"act1-graybox-corner.png");
        cam.transform.position=new(0,18,13);cam.transform.LookAt(Vector3.zero);
        Capture(GameObject.Find("OverviewCam_ReviewOnly").GetComponent<Camera>(),"act1-graybox-overview.png");
        int triangles=arena.GetComponentsInChildren<MeshFilter>().Sum(m=>m.sharedMesh.triangles.Length/3);
        Directory.CreateDirectory(Path.Combine(Output,"scene"));
        var text=new StringBuilder("# 第一幕灰盒验收\n\n");
        text.AppendLine("- 可玩区域：60×60m；地面顶面 Y=0；中央16×16m留空。");
        text.AppendLine("- 障碍物：8个；独立竖直圆柱碰撞体 COL_CYL_01～08。");
        text.AppendLine("- 最小障碍物净间距："+gap.ToString("F2")+"m（要求≥6m）。");
        text.AppendLine("- 近侧栏杆0.8m，连蜡烛≤1m；外圈15m装饰无碰撞。");
        text.AppendLine("- 总三角面（含隐藏碰撞体）："+triangles+"；材质4种，均URP/Lit。");
        text.AppendLine("- 素材：仅Unity原生几何体，无外部模型、人物、动物或付费素材。");
        text.AppendLine("- 已按固定GameCam与角落机位渲染1600×900截图，另附全场总览。");
        text.AppendLine("- 当前仅灰盒；未进行美术或GLB导出，等待用户验收。");
        File.WriteAllText(Path.Combine(Output,"scene","act1-graybox-validation.md"),text.ToString());
        EditorSceneManager.SaveScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene());
        Debug.Log("VERONA_GRAYBOX_OK triangles="+triangles+" colliders=8 minGap="+gap);
    }
}
