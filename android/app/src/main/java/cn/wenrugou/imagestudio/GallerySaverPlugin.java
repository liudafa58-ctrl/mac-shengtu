package cn.wenrugou.imagestudio;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.net.URLConnection;

@CapacitorPlugin(
    name = "GallerySaver",
    permissions = {
        @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class GallerySaverPlugin extends Plugin {
    private static final String ALBUM_NAME = "稳如狗生图工作台";

    @PluginMethod
    public void saveImage(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermissionCallback");
            return;
        }

        writeImageToGallery(call);
    }

    @PermissionCallback
    private void storagePermissionCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) {
            writeImageToGallery(call);
            return;
        }

        call.reject("没有相册写入权限");
    }

    private void writeImageToGallery(PluginCall call) {
        String base64 = call.getString("base64", "");
        String imageUrl = call.getString("url", "");
        String mimeType = call.getString("mimeType", "image/png");
        String fileName = sanitizeFileName(call.getString("fileName", defaultFileName(mimeType)));

        try {
            ImageBytes imageBytes = readImageBytes(base64, imageUrl, mimeType);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                saveWithMediaStore(call, imageBytes.bytes, imageBytes.mimeType, fileName);
            } else {
                saveWithPublicPictures(call, imageBytes.bytes, imageBytes.mimeType, fileName);
            }
        } catch (Exception error) {
            call.reject("保存到手机相册失败：" + error.getMessage(), error);
        }
    }

    private ImageBytes readImageBytes(String base64, String imageUrl, String fallbackMimeType) throws Exception {
        if (base64 != null && !base64.trim().isEmpty()) {
            return new ImageBytes(Base64.decode(base64, Base64.DEFAULT), fallbackMimeType);
        }

        if (imageUrl == null || imageUrl.trim().isEmpty()) {
            throw new IllegalArgumentException("图片数据为空");
        }

        URLConnection connection = new URL(imageUrl).openConnection();
        connection.setConnectTimeout(30000);
        connection.setReadTimeout(120000);

        String contentType = connection.getContentType();
        String mimeType = contentType != null && contentType.startsWith("image/") ? contentType : fallbackMimeType;

        try (InputStream inputStream = connection.getInputStream();
             ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int length;
            while ((length = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, length);
            }

            return new ImageBytes(outputStream.toByteArray(), mimeType);
        }
    }

    private void saveWithMediaStore(PluginCall call, byte[] bytes, String mimeType, String fileName) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
        values.put(MediaStore.Images.Media.MIME_TYPE, mimeType);
        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + File.separator + ALBUM_NAME);
        values.put(MediaStore.Images.Media.IS_PENDING, 1);

        Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            throw new IllegalStateException("无法创建相册文件");
        }

        try (OutputStream outputStream = resolver.openOutputStream(uri)) {
            if (outputStream == null) {
                throw new IllegalStateException("无法写入相册文件");
            }
            outputStream.write(bytes);
        } catch (Exception error) {
            resolver.delete(uri, null, null);
            throw error;
        }

        values.clear();
        values.put(MediaStore.Images.Media.IS_PENDING, 0);
        resolver.update(uri, values, null, null);

        JSObject result = new JSObject();
        result.put("uri", uri.toString());
        result.put("album", ALBUM_NAME);
        call.resolve(result);
    }

    private void saveWithPublicPictures(PluginCall call, byte[] bytes, String mimeType, String fileName) throws Exception {
        File picturesDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES);
        File albumDir = new File(picturesDir, ALBUM_NAME);
        if (!albumDir.exists() && !albumDir.mkdirs()) {
            throw new IllegalStateException("无法创建相册目录");
        }

        File imageFile = new File(albumDir, fileName);
        try (FileOutputStream outputStream = new FileOutputStream(imageFile)) {
            outputStream.write(bytes);
        }

        MediaScannerConnection.scanFile(
            getContext(),
            new String[] { imageFile.getAbsolutePath() },
            new String[] { mimeType },
            null
        );

        JSObject result = new JSObject();
        result.put("uri", Uri.fromFile(imageFile).toString());
        result.put("path", imageFile.getAbsolutePath());
        result.put("album", ALBUM_NAME);
        call.resolve(result);
    }

    private String sanitizeFileName(String fileName) {
        String next = fileName == null ? "" : fileName.trim().replaceAll("[\\\\/:*?\"<>|\\r\\n]+", "_");
        return next.isEmpty() ? defaultFileName("image/png") : next;
    }

    private String defaultFileName(String mimeType) {
        String extension = "png";
        if ("image/jpeg".equals(mimeType) || "image/jpg".equals(mimeType)) {
            extension = "jpg";
        } else if ("image/webp".equals(mimeType)) {
            extension = "webp";
        }
        return "wenrugou-image-" + System.currentTimeMillis() + "." + extension;
    }

    private static class ImageBytes {
        final byte[] bytes;
        final String mimeType;

        ImageBytes(byte[] bytes, String mimeType) {
            this.bytes = bytes;
            this.mimeType = mimeType;
        }
    }
}
