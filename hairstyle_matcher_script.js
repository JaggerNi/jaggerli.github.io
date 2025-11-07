
function matchHairstyle() {
    const fileInput = document.getElementById('imageUpload');
    const file = fileInput.files[0];

    if (!file) {
        alert('Please upload an image!');
        return;
    }

    const formData = new FormData();
    formData.append('image', file);

    // Simulate a match result for now
    const result = 'Match found: New Trendy Hairstyle!';

    document.getElementById('result').innerText = result;
}
