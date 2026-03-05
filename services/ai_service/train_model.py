import os
import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score

data = [
    ("VPN not working", "network"),
    ("Internet down in office", "network"),
    ("WiFi unstable", "network"),
    ("Laptop screen broken", "hardware"),
    ("Printer not printing", "hardware"),
    ("Keyboard not working", "hardware"),
    ("App crashes on login", "software"),
    ("Password reset not working", "software"),
    ("Update failed with error", "software"),
    ("Suspicious email phishing", "security"),
    ("Malware detected", "security"),
    ("Unauthorized access attempt", "security"),
]

texts = [t[0] for t in data]
labels = [t[1] for t in data]

X_train, X_test, y_train, y_test = train_test_split(
    texts, labels, test_size=0.3, random_state=42
)

vectorizer = TfidfVectorizer()
X_train_vec = vectorizer.fit_transform(X_train)
X_test_vec = vectorizer.transform(X_test)

model = LogisticRegression()
model.fit(X_train_vec, y_train)

predictions = model.predict(X_test_vec)

print("Accuracy:", accuracy_score(y_test, predictions))
print("\nConfusion Matrix:\n", confusion_matrix(y_test, predictions))
print("\nClassification Report:\n", classification_report(y_test, predictions))

os.makedirs("model", exist_ok=True)
joblib.dump(model, "model/classifier.pkl")
joblib.dump(vectorizer, "model/vectorizer.pkl")

print("Model saved successfully.")